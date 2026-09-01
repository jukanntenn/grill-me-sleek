/**
 * The two-link answer race of one grilling round. The Hub round opens first,
 * within a bounded reveal budget, so the answer-page URL rides the downstream
 * card; then the downstream link — the `userQuestions` waterfall (official
 * cards, IM bridges, remote apps — first answer wins among them by gateway
 * arrival order) — races the Hub link, the round's long-poll loop. A dedicated
 * controller — chained from the tool call's signal — aborts the loser, and the
 * winner's answers become the round's, with the losing surface converged: a
 * Hub win aborts the ask (the gateway withdraws the question everywhere), a
 * downstream win proxy-submits to the Hub and revises on conflict so the Hub
 * matches the recorded result.
 *
 * @module @grilling-sleek/dsh-tool-grill-user/race
 */

import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { UserQuestionError } from "@deepseek-ai/dsh-user-questions";
import type { AskUserQuestionAnswerItem } from "@deepseek-ai/dsh-user-questions";
import { timeoutOf } from "@deepseek-ai/dsh-timeout";
import { TOOL_TIMEOUT } from "@deepseek-ai/dsh-tool-call-timeout-policy";
import { GrillingHubError, sleepAbortable } from "./hub.ts";
import type { GrillingHubClient } from "./hub.ts";
import {
  answersToResponseInput,
  hubResponseToAnswers,
  toAskItems,
  toHubGrilling,
} from "./mapping.ts";
import type { GrillingAnswer, GrillingOutcome, GrillingQuestion } from "./types.ts";

/** A promise that never settles, standing in for an answer link that cannot produce one. */
const NEVER: Promise<never> = new Promise(() => {});

/** How long the card may wait for the Hub round to open so its URL can ride along. */
const URL_REVEAL_BUDGET_MS = 2_000;

/** Which answer link won the race. */
type AnswerSource = "downstream" | "hub";

/** The tagged value the race settles with. */
interface RaceWinner {
  source: AnswerSource;
  answers: GrillingAnswer[];
}

/** One Hub session per agent session: the id and answer-page URL once created, and the in-flight creation while it resolves. */
export interface HubSessionLink {
  sessionId?: string;
  url?: string;
  creating?: Promise<unknown> | undefined;
}

/** Inputs of one round's race. */
export interface AskRoundOptions {
  /** The root agent asking; owns the user-questions scope and the Hub session. */
  readonly agent: Agent;
  /** The tool call's signal: user aborts and the round deadline arrive here. */
  readonly signal: AbortSignal;
  /** The canonical questions (Hub submission payloads). */
  readonly questions: GrillingQuestion[];
  /** The decision-tree branch this round grills. */
  readonly branch: string;
  /** The Hub client, or undefined in hubless mode. */
  readonly hub: GrillingHubClient | undefined;
  /** Per-agent-session Hub linkage. */
  readonly hubSessions: WeakMap<Agent["session"], HubSessionLink>;
  /** How long the card waits for the Hub round to open; defaults to {@link URL_REVEAL_BUDGET_MS}. */
  readonly urlRevealBudgetMs?: number | undefined;
}

/** One round's settled outcome; non-answered rounds carry the error to rethrow. */
export type AskRoundResult =
  | {
      outcome: "answered";
      answers: GrillingAnswer[];
      /** The opened Hub linkage, when this round raced on one. */
      hub?: { sessionId: string; url: string };
    }
  | { outcome: Exclude<GrillingOutcome, "answered">; error: unknown };

function toGrillingAnswer(item: AskUserQuestionAnswerItem): GrillingAnswer {
  return {
    id: item.id,
    selected: [...item.selected],
    ...(item.custom !== undefined ? { custom: item.custom } : {}),
  };
}

function isNoProvider(error: unknown): boolean {
  return error instanceof UserQuestionError && error.code === "NO_PROVIDER";
}

function isHubExpired(error: unknown): boolean {
  return error instanceof GrillingHubError && error.status === 410;
}

/**
 * Open this round on the Hub: the first call creates the session (round 1),
 * later calls push rounds; concurrent calls wait out the in-flight creation
 * and then push their own round.
 * @param hub - the Hub client.
 * @param state - the agent session's Hub linkage.
 * @param branch - the canonical branch.
 * @param questions - the canonical batch.
 * @param signal - cancellation lifetime of the whole operation.
 * @returns the session id and this call's round number.
 */
async function openHubRound(
  hub: GrillingHubClient,
  state: HubSessionLink,
  branch: string,
  questions: GrillingQuestion[],
  signal: AbortSignal,
): Promise<{ sessionId: string; round: number }> {
  const grilling = toHubGrilling(branch, questions);
  if (state.sessionId === undefined && state.creating !== undefined) {
    await state.creating;
  }
  if (state.sessionId === undefined) {
    const creating = hub.createSession(grilling, signal).then(
      (created) => {
        state.sessionId = created.sessionId;
        state.url = created.url;
        state.creating = undefined;
        return { sessionId: created.sessionId, round: created.round };
      },
      (error) => {
        state.creating = undefined;
        throw error;
      },
    );
    state.creating = creating;
    return creating;
  }
  const pushed = await hub.pushRound(state.sessionId, grilling, signal);
  return { sessionId: state.sessionId, round: pushed.round };
}

/**
 * Converge the Hub onto the recorded result after the downstream link won:
 * the answers are submitted as a proxy, and a conflict (the answer page
 * answered first) is settled by a latest-wins revise. Failure is logged and
 * swallowed — the round is already answered, and the recorded result is the
 * truth.
 * @param ctx - context for logging.
 * @param hub - the Hub client.
 * @param sessionId - the owning Hub session.
 * @param round - the round being converged.
 * @param questions - the canonical batch.
 * @param answers - the recorded answers.
 * @param signal - cancellation lifetime of the convergence calls.
 */
async function convergeHubToLog(
  ctx: Context,
  hub: GrillingHubClient,
  sessionId: string,
  round: number,
  questions: GrillingQuestion[],
  answers: GrillingAnswer[],
  signal: AbortSignal,
): Promise<void> {
  try {
    const input = answersToResponseInput(questions, answers);
    const submitted = await hub.submitResponse(sessionId, round, input, signal);
    if (submitted.kind === "created") return;
    await hub.reviseResponse(sessionId, round, input, signal);
  } catch (error) {
    ctx.logger.warn(`grill_user could not converge Hub round ${round}: ${String(error)}`);
  }
}

/**
 * Run one grilling round's race and settle it. When a Hub is configured the
 * round opens there first, bounded by the reveal budget, so the answer-page
 * URL rides the card; then the two links race.
 * @param ctx - the registrant context (user-questions scope and logging).
 * @param options - the round's links and inputs.
 * @returns the round's outcome; non-answered outcomes carry the error the
 *   tool rethrows to the model.
 */
export async function askRound(ctx: Context, options: AskRoundOptions): Promise<AskRoundResult> {
  const controller = new AbortController();
  const caller = options.signal;
  if (caller.aborted) controller.abort(caller.reason);
  else caller.addEventListener("abort", () => controller.abort(caller.reason), { once: true });

  const hub = options.hub;
  let state = options.hubSessions.get(options.agent.session);
  if (state === undefined) {
    state = {};
    options.hubSessions.set(options.agent.session, state);
  }
  // Filled as soon as the Hub link has opened this call's round; convergence
  // needs the round number, and before it fills the round may not exist yet.
  const hubTarget: { sessionId?: string; round?: number } = {};

  // The Hub round opens before the card goes out, so the answer-page URL can
  // ride the card — the one surface every downstream endpoint renders. The
  // card waits at most the reveal budget: past it the round still opens and
  // races, only URL-less, while a fast permanent open failure degrades the
  // round to downstream-only instead of failing the call.
  let hubLink: Promise<RaceWinner> | undefined;
  let hubUrl: string | undefined;
  if (hub !== undefined) {
    const opening = openHubRound(hub, state, options.branch, options.questions, controller.signal);
    let degraded = false;
    try {
      const withinBudget = await Promise.race([
        opening,
        sleepAbortable(options.urlRevealBudgetMs ?? URL_REVEAL_BUDGET_MS, controller.signal).then(
          (): undefined => undefined,
        ),
      ]);
      if (withinBudget !== undefined) hubUrl = state.url;
    } catch (error) {
      // An abort here flows on: the ask below rejects on the aborted signal
      // and the settle path classifies. Only a genuine open failure degrades.
      if (!controller.signal.aborted) {
        degraded = true;
        ctx.logger.warn(
          `grill_user answering downstream-only; the Hub round could not be opened: ${String(error)}`,
        );
      }
    }
    if (!degraded) {
      hubLink = opening
        .then(({ sessionId, round }) => {
          hubTarget.sessionId = sessionId;
          hubTarget.round = round;
          // Bare URL, nothing trailing: auto-linking swallows punctuation.
          if (state.url !== undefined) ctx.logger.info(`grill_user answer page: ${state.url}`);
          return hub.awaitResponse(sessionId, round, controller.signal);
        })
        .then<RaceWinner>((response) => ({
          source: "hub",
          answers: hubResponseToAnswers(options.questions, response),
        }));
    }
  }

  const downstream = ctx.userQuestions
    .ask({
      questions: toAskItems(options.questions, hubUrl),
      agent: options.agent,
      signal: controller.signal,
    })
    .then<RaceWinner | never>((answer) => ({
      source: "downstream",
      answers: answer.answers.map(toGrillingAnswer),
    }))
    .catch((error: unknown) => {
      // A profile whose waterfall has no answerer at all is "downstream
      // absent", not a failure — but only while the Hub link can still answer;
      // hubless and degraded rounds surface the error as their verdict.
      if (isNoProvider(error) && hubLink !== undefined) return NEVER;
      throw error;
    });

  try {
    const winner = await Promise.race(hubLink === undefined ? [downstream] : [downstream, hubLink]);
    if (
      winner.source === "downstream" &&
      hub !== undefined &&
      hubTarget.sessionId !== undefined &&
      hubTarget.round !== undefined
    ) {
      await convergeHubToLog(
        ctx,
        hub,
        hubTarget.sessionId,
        hubTarget.round,
        options.questions,
        winner.answers,
        caller,
      );
    }
    const answeredHub =
      state.sessionId !== undefined && state.url !== undefined
        ? { sessionId: state.sessionId, url: state.url }
        : undefined;
    return {
      outcome: "answered",
      answers: winner.answers,
      ...(answeredHub !== undefined ? { hub: answeredHub } : {}),
    };
  } catch (error) {
    const expired = timeoutOf(caller, TOOL_TIMEOUT) !== undefined || isHubExpired(error);
    if (hub !== undefined && state.sessionId !== undefined) {
      // Fresh signal: the caller's is aborted on this path, and this
      // cancellation is best effort.
      void hub.cancelSession(state.sessionId, new AbortController().signal).catch(() => {});
    }
    return { outcome: expired ? "expired" : "cancelled", error };
  } finally {
    controller.abort();
  }
}
