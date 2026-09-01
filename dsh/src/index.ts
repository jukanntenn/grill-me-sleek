/**
 * Model-facing grilling tool. `grill_user` asks the user one decision-tree
 * branch of questions as a structured form: the questions go to the
 * user-questions waterfall and — when a Hub is configured — to a
 * grill-me-sleek round whose answer page is the polished answer surface; the
 * Hub round opens first so its URL rides the card, then the two links race,
 * the losing surface is converged, and the Harness records the round through
 * the tool call itself (arguments carry the questions, the result carries the
 * answers and the opened Hub linkage). The interview skill rides along as a
 * runtime skill registration.
 *
 * @module @grilling-sleek/dsh-tool-grill-user
 */

import { randomUUID } from "node:crypto";
import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { brandString } from "@deepseek-ai/dsh-brand";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type { Agent } from "@deepseek-ai/dsh-agent";
// Type-only: resolves the ctx.agents registry declaration for optional access.
import type {} from "@deepseek-ai/dsh-agent";
import { toQuestions } from "./mapping.ts";
import { askRound } from "./race.ts";
import type { HubSessionLink } from "./race.ts";
import { registerGrillingSkill } from "./skill.ts";
import { GrillingHubClient } from "./hub.ts";
import type { GrillingRoundId } from "./types.ts";
export type * from "./types.ts";

export const name = "tool-grill-user";
export const inject = ["tools", "userQuestions"];

/** The public grill-me-sleek Hub — the default answer surface out of the box. */
const DEFAULT_HUB_BASE_URL = "https://grillingsleek.online";

/** Model-facing grilling tool configuration. */
export interface Config {
  /**
   * Base URL of the grill-me-sleek Hub serving the answer page. Defaults to
   * the public Hub; the empty string is hubless mode — user questions are
   * then the only answer surface.
   */
  baseUrl: string;
  /** Largest accepted question batch per round. */
  maxQuestionsPerRound: number;
  /** How long one round may stay pending before the deadline closes it as expired. */
  roundTimeoutMs: number;
}

/** Schemastery configuration for the grilling tool consumer. */
export const Config: z<Config> = z.object({
  baseUrl: z.string().default(DEFAULT_HUB_BASE_URL),
  maxQuestionsPerRound: z.number().min(1).max(64).default(16),
  roundTimeoutMs: z
    .number()
    .min(1)
    .default(4 * 3_600_000),
});

const DESCRIPTION =
  "Grill the user with one decision-tree branch of questions as a structured form. " +
  "One branch per call, from the main agent. Give each question a stable snake_case id with the " +
  "grill_ prefix, a short header, the full question text, and — when it offers choices — two or " +
  "more options with your recommended one marked via `recommended` plus `explanation`. Omit " +
  "options for free-text questions. Include your recommended choice per question; the user decides.";

/**
 * Register the `grill_user` tool and the grilling-sleek runtime skill.
 * @param ctx - registrant context carrying the tool and user-questions services.
 * @param config - deployment's grilling policy.
 */
export function apply(ctx: Context, config: Config): void {
  registerGrillingSkill(ctx);
  const hub =
    config.baseUrl === "" ? undefined : new GrillingHubClient({ baseUrl: config.baseUrl });
  const hubSessions = new WeakMap<Agent["session"], HubSessionLink>();
  ctx.tools.register(
    defineTool({
      name: "grill_user",
      description: DESCRIPTION,
      // The registry sets no deadline of its own; without this an interrupted
      // round could hang the tool body until the process ends.
      timeoutMs: config.roundTimeoutMs,
      // Pure I/O; sibling tools need not queue behind a pending round.
      isConcurrencySafe: () => true,
      parameters: {
        branch: {
          type: "string",
          required: true,
          description: "The decision-tree branch this round grills, in one short line.",
        },
        questions: {
          type: "array",
          required: true,
          description: "The questions of this branch (1..64), one recommendation each.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: {
                type: "string",
                required: true,
                description:
                  "Stable snake_case id with the grill_ prefix (e.g. grill_auth_provider); echoed in answers.",
              },
              header: {
                type: "string",
                required: true,
                description: "Short heading shown above the question.",
              },
              question: { type: "string", required: true, description: "The full question text." },
              options: {
                type: "array",
                description: "Two or more choices; omit for a free-text question.",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    label: {
                      type: "string",
                      required: true,
                      description: "User-facing option label.",
                    },
                    description: {
                      type: "string",
                      description: "One sentence on the tradeoff or impact.",
                    },
                  },
                },
              },
              multiSelect: {
                type: "boolean",
                description: "Whether several options may be selected.",
              },
              recommended: {
                type: "integer",
                description: "Index into options of your recommended choice.",
              },
              explanation: {
                type: "string",
                description: "Why you recommend it; rendered beside the recommendation.",
              },
              required: {
                type: "boolean",
                description: "Whether an answer is mandatory. Defaults to true.",
              },
              placeholder: { type: "string", description: "Hint for free-text answers." },
              maxLength: { type: "integer", description: "Character cap for free-text answers." },
            },
          },
        },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            roundId: {
              type: "string",
              required: true,
              description: "Identity of this grilling round; quote it when referring to the round.",
            },
            hub: {
              type: "object",
              additionalProperties: false,
              description:
                "The Hub round this call raced on; absent in hubless mode or when its round could not be opened.",
              properties: {
                sessionId: {
                  type: "string",
                  required: true,
                  description: "Identity of the Hub session carrying this conversation's rounds.",
                },
                url: {
                  type: "string",
                  required: true,
                  description:
                    "The Hub answer page, also shown on the question card; when echoing it, put the URL alone on its line — auto-linking swallows trailing punctuation.",
                },
              },
            },
            answers: {
              type: "array",
              required: true,
              description: "The answers the user gave, in question order.",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string", required: true },
                  selected: { type: "array", required: true, items: { type: "string" } },
                  custom: { type: "string" },
                },
              },
            },
          },
        },
        render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
      },
      async execute(args, exec) {
        const agent = exec.agent;
        const agents = ctx.get("agents");
        // The seam's DELEGATED_CALLER guard covers the downstream link only;
        // the Hub link has no such guard, and an owned subagent has no business
        // opening rounds on the user's Hub session either.
        if (agent === undefined || agents === undefined || !agents.roots().includes(agent)) {
          throw new Error(
            "grill_user requires the main agent; a subagent resolves its remaining questions itself " +
              "and includes them in its final report",
          );
        }
        const { branch, questions } = toQuestions(
          args.branch,
          args.questions,
          config.maxQuestionsPerRound,
        );
        const roundId = brandString<GrillingRoundId>(randomUUID());
        const result = await askRound(ctx, {
          agent,
          signal: exec.signal,
          questions,
          branch,
          hub,
          hubSessions,
        });
        if (result.outcome !== "answered") throw result.error;
        return {
          roundId,
          ...(result.hub !== undefined ? { hub: result.hub } : {}),
          answers: result.answers,
        };
      },
      presentCall: (args) => ({
        card: "generic",
        title: `Grill: ${args.branch}`,
        kind: "other",
        rawInput: args.questions,
      }),
    }),
  );
}
