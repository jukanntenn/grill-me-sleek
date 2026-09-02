/**
 * The revision watcher: the model's ear on a live Hub session. The user can
 * revise any answered round on the answer page at any time while the session
 * is active, but a tool call returns the moment its round settles — so
 * between calls nothing would hear those revisions. The watcher reads the
 * session's SSE stream (the same one the answer page uses — Node has no
 * dependable global EventSource, so the reader is a small fetch-body parser)
 * and delivers every revision the watermarks have not yet surfaced:
 * `response.revised` fetches the round's latest answers, and every
 * (re)connection re-syncs the round summaries so a missed event heals by the
 * watermark comparison. Delivery rides the jobs pattern — an idle agent is
 * woken with `followup`, a busy one is handed `inject` — under a small
 * consecutive-wake budget that a settled round refills. Terminal events stop
 * the watcher; the watcher never closes the session (sessions live to their
 * TTL — that lifetime is the user's revision window).
 *
 * @module @grilling-sleek/dsh-tool-grill-user/watch
 */

import { randomUUID } from "node:crypto";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { brandString } from "@deepseek-ai/dsh-brand";
// Type-only: the message shape of the LLM core. Constructing the notice
// inline keeps dsh-llm out of the runtime dependency graph — the factory in
// that package only brands an id and freezes, both done here.
import type { MessageId, UserMessage } from "@deepseek-ai/dsh-llm";
import type { GrillingHubClient } from "./hub.ts";
import { sleepAbortable } from "./hub.ts";
import { hubGrillingToQuestions, hubResponseToAnswers } from "./mapping.ts";

/** SSE events that end the watched session; seeing one stops the watcher. */
const TERMINAL_EVENTS = new Set(["session.completed", "session.cancelled", "session.expired"]);

/** Consecutive idle wakes allowed without a settled round between them. */
const WAKE_BUDGET = 3;

/** Reconnect backoff: 1 s doubling per failed attempt, capped at 30 s. */
function reconnectDelayMs(attempt: number): number {
  return Math.min(2 ** (attempt - 1), 30) * 1000;
}

/** A running revision watcher. */
export interface RevisionWatcher {
  /** Stop watching and close the stream. Idempotent. */
  stop(): void;
  /**
   * Record agent-facing activity — an answered round. Revisions are
   * human-paced, but the wake budget still wants a refill whenever the
   * human has demonstrably interacted since the last wake.
   */
  noteActivity(): void;
}

/** Options of {@link startRevisionWatcher}. */
export interface RevisionWatcherOptions {
  /** Registrant context: logging and the dispose effect that owns the stream. */
  readonly ctx: Context;
  /** The Hub client the resync and round fetches ride on. */
  readonly hub: GrillingHubClient;
  /** The root agent revisions are delivered to. */
  readonly agent: Agent;
  /** The live Hub session to watch. */
  readonly sessionId: string;
  /** The session's revision watermarks, shared with the race: delivery advances them. */
  readonly watermarks: Map<number, number>;
  /** Transport override for the SSE stream; defaults to the global fetch. */
  readonly fetch?: typeof fetch | undefined;
}

/** One parsed SSE event block: the event name and the joined data lines. */
export interface SseEvent {
  readonly event: string;
  readonly data: string;
}

/**
 * Parse one SSE block (the text between blank-line separators) into its
 * event name and data, or undefined when the block carries nothing
 * dispatchable (comments, keepalives, bare field lines).
 * @param block - the raw block text, without its terminating blank line.
 */
export function parseSseBlock(block: string): SseEvent | undefined {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    // `id` and `retry` are accepted and ignored: the resync-on-reconnect
    // discipline makes replay ids unnecessary.
  }
  if (data.length === 0) return undefined;
  return { event, data: data.join("\n") };
}

/** The `response.revised` SSE payload. */
interface RoundRevision {
  round: number;
  revision: number;
}

function parseRoundRevision(data: string): RoundRevision | undefined {
  try {
    const parsed = JSON.parse(data) as { round?: unknown; revision?: unknown };
    if (typeof parsed.round === "number" && typeof parsed.revision === "number") {
      return { round: parsed.round, revision: parsed.revision };
    }
  } catch {
    // Malformed payload: the resync on the next (re)connect repairs it.
  }
  return undefined;
}

/**
 * Build the plugin notice carrying one revision. Mirrors the message factory
 * of the LLM core (branded id, frozen user message, plugin-notice source).
 */
function revisionNotice(
  round: number,
  name: string,
  revision: number,
  answersJson: string,
): UserMessage {
  const summary = `Round ${round} answers revised (revision ${revision})`;
  const text =
    `grill_user: the user revised their answers to "${name}" (Hub round ${round}, now revision ${revision}). ` +
    `These latest answers supersede every earlier delivery of that round:\n${answersJson}`;
  return Object.freeze({
    id: brandString<MessageId>(randomUUID()),
    role: "user",
    content: [{ type: "text", text }],
    source: { kind: "plugin", plugin: "tool-grill-user", form: "notice", summary },
  }) as UserMessage;
}

/**
 * Read one `text/event-stream` response body to its end, dispatching every
 * parsed block. Resolves when the stream ends cleanly; rejects on a
 * transport error. Both are the caller's cue to reconnect.
 */
async function readSseBody(
  body: ReadableStream<Uint8Array>,
  dispatch: (event: SseEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Blocks end at a blank line; a trailing partial stays buffered.
      for (;;) {
        const separator = buffer.indexOf("\n\n");
        if (separator === -1) break;
        const block = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const parsed = parseSseBlock(block);
        if (parsed !== undefined) dispatch(parsed);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Start the revision watcher for one live Hub session. The stream's lifetime
 * is the session's: terminal events, a refused connection, or plugin disposal
 * stop it. Stream drops reconnect with backoff — every reconnection replays
 * the round summaries, so nothing reachable is lost. Failures degrade
 * silently to the watermark sync of the next `grill_user` call — the watcher
 * is an accelerator of delivery, never a gate on correctness.
 * @param options - the session linkage and delivery target.
 * @returns the watcher handle.
 */
export function startRevisionWatcher(options: RevisionWatcherOptions): RevisionWatcher {
  const { ctx, hub, agent, sessionId, watermarks } = options;
  const transport = options.fetch ?? fetch;
  const controller = new AbortController();
  let stopped = false;
  let consecutiveWakes = 0;
  let resyncing = false;
  let resyncAgain = false;
  const delivering = new Set<number>();

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    controller.abort();
  };
  // The stream is an effect of the plugin's context: unloading the plugin
  // closes it even if no round ever settles again.
  try {
    ctx.effect(() => () => stop());
  } catch {
    // The plugin is being torn down; nothing is left to watch.
    stop();
  }

  const deliverRound = async (round: number, knownRevision?: number): Promise<void> => {
    if (stopped || delivering.has(round)) return;
    // An event revision the watermark already covers needs no fetch.
    if (knownRevision !== undefined && knownRevision <= (watermarks.get(round) ?? 0)) return;
    delivering.add(round);
    try {
      const detail = await hub.getRound(sessionId, round, controller.signal);
      const response = detail.response;
      // Unanswered (a revision raced a fresh round's creation): nothing to say.
      if (response === undefined) return;
      const revision = response.revision ?? 1;
      if (revision <= (watermarks.get(round) ?? 0)) return;
      const questions = hubGrillingToQuestions(detail.grilling);
      const answers = hubResponseToAnswers(questions, response);
      const name = detail.name ?? `round ${round}`;
      const message = revisionNotice(round, name, revision, JSON.stringify(answers));
      if (agent.status === "idle" && consecutiveWakes < WAKE_BUDGET) {
        consecutiveWakes++;
        agent.followup(message);
      } else {
        agent.inject(message);
      }
      watermarks.set(round, revision);
    } catch (error) {
      if (!controller.signal.aborted) {
        ctx.logger.warn(
          `grill_user revision watcher could not deliver round ${round}: ${String(error)}`,
        );
      }
    } finally {
      delivering.delete(round);
    }
  };

  const resync = async (): Promise<void> => {
    if (stopped) return;
    if (resyncing) {
      resyncAgain = true;
      return;
    }
    resyncing = true;
    try {
      const summaries = await hub.listRounds(sessionId, controller.signal);
      for (const summary of summaries) {
        if (!summary.has_response) continue;
        if (summary.revision > (watermarks.get(summary.round) ?? 0)) {
          await deliverRound(summary.round);
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        ctx.logger.warn(`grill_user revision watcher resync failed: ${String(error)}`);
      }
    } finally {
      resyncing = false;
      if (resyncAgain && !stopped) {
        resyncAgain = false;
        void resync();
      }
    }
  };

  const dispatch = (event: SseEvent): void => {
    if (stopped) return;
    if (TERMINAL_EVENTS.has(event.event)) {
      ctx.logger.info(`grill_user revision watcher: ${event.event} ended session ${sessionId}`);
      stop();
      return;
    }
    if (event.event !== "response.revised") return;
    const revised = parseRoundRevision(event.data);
    if (revised !== undefined) void deliverRound(revised.round, revised.revision);
  };

  // The connect/read/reconnect loop. A refused stream (any non-200) is
  // fatal — the session is gone or the endpoint is not there — while a drop
  // or error mid-stream reconnects with backoff, resyncing on arrival.
  void (async () => {
    let attempt = 0;
    while (!stopped) {
      let response: Response;
      try {
        response = await transport(hub.eventsUrl(sessionId), {
          headers: { accept: "text/event-stream" },
          signal: controller.signal,
        });
      } catch (error) {
        if (stopped || controller.signal.aborted) return;
        attempt++;
        ctx.logger.warn(
          `grill_user revision watcher connect failed (attempt ${attempt}): ${String(error)}`,
        );
        try {
          await sleepAbortable(reconnectDelayMs(attempt), controller.signal);
        } catch {
          return;
        }
        continue;
      }
      if (response.status !== 200 || response.body === null) {
        ctx.logger.warn(
          `grill_user revision watcher: stream refused (${response.status}) for session ${sessionId}`,
        );
        stop();
        return;
      }
      attempt = 0;
      resync();
      try {
        await readSseBody(response.body, dispatch);
        // A clean end (server closed the stream) is a drop, not an ending.
        if (stopped) return;
        ctx.logger.warn(`grill_user revision watcher: stream ended for session ${sessionId}`);
      } catch (error) {
        if (stopped || controller.signal.aborted) return;
        ctx.logger.warn(`grill_user revision watcher stream error: ${String(error)}`);
      }
      if (stopped) return;
      try {
        await sleepAbortable(reconnectDelayMs(1), controller.signal);
      } catch {
        return;
      }
    }
  })();

  return {
    stop,
    noteActivity: () => {
      consecutiveWakes = 0;
    },
  };
}
