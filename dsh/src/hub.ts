/**
 * REST client for a grill-me-sleek Hub: session creation, round push, the
 * clamped long-poll answer loop (collecting revision notices from 202
 * bodies), round listing and detail fetch for the revision watermark sync,
 * proxy submission with revise-on-conflict, the SSE events URL, and
 * best-effort cancellation — the Hub link of the `grill_user` race. The
 * Hub's contract lives in this repository (`server/schemas/*.json`); this
 * module is the only place here that speaks it.
 *
 * @module @grilling-sleek/dsh-tool-grill-user/hub
 */

import { randomUUID } from "node:crypto";

/** Question batch in the Hub wire shape (the Hub's `grilling.json`). */
export interface HubGrilling {
  /** Round title the answer page shows. */
  name: string;
  /** Optional longer context above the questions. */
  description?: string;
  /** Configuration of the global notes field the answer page appends. */
  additional_notes?: {
    label?: string;
    placeholder?: string;
    max_length?: number;
    required?: boolean;
  };
  /** The questions, in order. */
  questions: HubQuestion[];
}

/** One question in the Hub wire shape. */
export interface HubQuestion {
  id: string;
  header: string;
  text: string;
  type: "single" | "multi" | "text";
  options?: { label: string; description?: string }[];
  recommended?: number;
  explanation?: string;
  required?: boolean;
  placeholder?: string;
  max_length?: number;
}

/** Answer submission body (the Hub's `response_input.json`). */
export interface HubResponseInput {
  /** Answers keyed by question id. */
  answers: Record<string, { selected: string | string[]; custom_text?: string }>;
  /** Content of the global notes field, when the user wrote any. */
  additional_notes?: string;
}

/** A stored Hub response, as returned by the response endpoints. */
export interface HubStoredResponse {
  round: number;
  answers: Record<string, { selected: string | string[]; custom_text?: string }>;
  additional_notes?: string;
  submitted_at: string;
  revision?: number;
  revised_at?: string;
}

/** One round summary row, as returned by the round-list endpoint. */
export interface HubRoundSummary {
  round: number;
  name?: string | null;
  has_response: boolean;
  revision: number;
}

/** One round's full record: the pushed grilling plus the stored response. */
export interface HubRoundDetail {
  round: number;
  name?: string | null;
  grilling: HubGrilling;
  response?: HubStoredResponse;
}

/** A revision the long-poll loop observed on another round while parked. */
export interface HubRoundNotice {
  round: number;
  revision: number;
}

/** What a completed wait returns: the stored response plus revisions observed on other rounds during the wait. */
export interface HubAwaitOutcome {
  response: HubStoredResponse;
  notices: HubRoundNotice[];
}

/** A Hub HTTP failure the caller can classify by status. */
export class GrillingHubError extends Error {
  /** HTTP status of the failing response. */
  readonly status: number;

  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "GrillingHubError";
    this.status = status;
  }
}

/** Constructor input; `fetch` is injectable so tests drive a stub transport. */
export interface GrillingHubClientOptions {
  /** Hub origin, for example `https://hub.example.com` (no trailing slash needed). */
  baseUrl: string;
  /** Transport override; defaults to the global fetch. */
  fetch?: typeof fetch;
}

/** One long-poll window in seconds; the server clamps at 60, 55 leaves proxy margin. */
const LONGPOLL_WAIT_S = 55;
/** Request budget for ordinary calls, long-poll adds its window plus slack. */
const REQUEST_TIMEOUT_MS = 10_000;
/** Cap of the transient-failure backoff ladder. */
const MAX_BACKOFF_MS = 30_000;
/** Fallback sleep when a 429 carries no usable retry-after. */
const RETRY_AFTER_FALLBACK_S = 5;

function isTransient(status: number): boolean {
  return status === 408 || status === 500 || status === 502 || status === 503 || status === 504;
}

function backoffMs(consecutiveErrors: number): number {
  return Math.min(2 ** (consecutiveErrors - 1), MAX_BACKOFF_MS / 1000) * 1000;
}

function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get("retry-after"));
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : RETRY_AFTER_FALLBACK_S) * 1000;
}

function abortError(signal: AbortSignal, cause: unknown): Error {
  return new Error("grilling hub link aborted", { cause });
}

/** Sleep `ms`, rejecting early when `signal` aborts — every Hub-side wait is abortable. */
export function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const settle = () => {
      signal.removeEventListener("abort", onAbort);
    };
    const timer = setTimeout(() => {
      settle();
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal, signal.reason));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function readJson(response: Response): Promise<unknown> {
  return JSON.parse(await response.text()) as unknown;
}

async function hubError(response: Response): Promise<GrillingHubError> {
  const text = await response.text().catch(() => "");
  let message = text;
  try {
    const body = JSON.parse(text) as { message?: unknown; status?: unknown; detail?: unknown };
    if (typeof body.message === "string") message = body.message;
    else if (typeof body.detail === "string") message = body.detail;
    else if (typeof body.status === "string") message = body.status;
  } catch {
    // Not JSON: keep the raw text.
  }
  return new GrillingHubError(`grilling hub ${response.status}: ${message}`, response.status);
}

/** Outcome of submitting a response: fresh, or a conflict carrying the stored winner. */
export type HubSubmitResult =
  | { kind: "created"; response: HubStoredResponse }
  | { kind: "conflict"; response: HubStoredResponse };

/**
 * The Hub REST client. Retry policy mirrors the reference CLI
 * (`@grilling-sleek/cli`): create, push, and poll retry transient failures
 * (network, 408/429/5xx) with exponential backoff until aborted; submit,
 * revise, and cancel are single-shot because their callers treat them as
 * best effort.
 */
export class GrillingHubClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(options: GrillingHubClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.#fetch = options.fetch ?? fetch;
  }

  /**
   * Create a Hub session whose first round is `grilling`.
   * @param grilling - the round's question batch.
   * @param signal - cancellation lifetime of the call.
   * @returns the new session id, its answer-page URL, and round 1's number.
   */
  async createSession(
    grilling: HubGrilling,
    signal: AbortSignal,
  ): Promise<{ sessionId: string; url: string; round: number }> {
    const body = (await this.#requestJsonWithRetry("POST", "sessions", grilling, signal)) as {
      session_id: string;
      url: string;
      current_round: number;
    };
    return { sessionId: body.session_id, url: body.url, round: body.current_round };
  }

  /**
   * Push the next round onto an existing Hub session.
   * @param sessionId - the session created by {@link createSession}.
   * @param grilling - the round's question batch.
   * @param signal - cancellation lifetime of the call.
   * @returns the server-assigned round number.
   */
  async pushRound(
    sessionId: string,
    grilling: HubGrilling,
    signal: AbortSignal,
  ): Promise<{ round: number }> {
    const body = (await this.#requestJsonWithRetry(
      "POST",
      `sessions/${sessionId}/rounds`,
      grilling,
      signal,
    )) as { round: number };
    return { round: body.round };
  }

  /**
   * List the session's round summaries — the per-round revision counters the
   * watermark sync compares against.
   * @param sessionId - the owning Hub session.
   * @param signal - cancellation lifetime of the call.
   */
  async listRounds(sessionId: string, signal: AbortSignal): Promise<HubRoundSummary[]> {
    return (await this.#getJsonWithRetry(
      `sessions/${sessionId}/rounds`,
      signal,
    )) as HubRoundSummary[];
  }

  /**
   * Fetch one round's full record — the pushed grilling plus the stored
   * response — for mapping a revision's latest answers.
   * @param sessionId - the owning Hub session.
   * @param round - the round number.
   * @param signal - cancellation lifetime of the call.
   */
  async getRound(sessionId: string, round: number, signal: AbortSignal): Promise<HubRoundDetail> {
    return (await this.#getJsonWithRetry(
      `sessions/${sessionId}/rounds/${round}`,
      signal,
    )) as HubRoundDetail;
  }

  /** The session's SSE event-stream URL — the watcher subscribes here. */
  eventsUrl(sessionId: string): string {
    return `${this.#baseUrl}/v1/sessions/${sessionId}/events`;
  }

  /**
   * Long-poll one round until it is answered. Each request waits one
   * ≤55 s window and the loop re-arms until an answer, a terminal session
   * state, an unrecoverable error, or the abort signal ends it. A 202 body
   * may carry a revision that landed on another round while this loop was
   * parked; those notices are collected and returned alongside the answer.
   * @param sessionId - the owning Hub session.
   * @param round - the round number to wait on.
   * @param signal - cancellation lifetime of the whole wait.
   * @returns the stored response once the round is answered, plus any
   *   revision notices observed on other rounds during the wait.
   * @throws {GrillingHubError} status 410 when the Hub session reached a
   *   terminal state, 404 when the session or round is unknown.
   */
  async awaitResponse(
    sessionId: string,
    round: number,
    signal: AbortSignal,
  ): Promise<HubAwaitOutcome> {
    const notices = new Map<number, number>();
    let consecutiveErrors = 0;
    while (true) {
      let response: Response;
      try {
        response = await this.#fetch(
          `${this.#baseUrl}/v1/sessions/${sessionId}/rounds/${round}/response?wait=${LONGPOLL_WAIT_S}`,
          {
            headers: { accept: "application/json" },
            signal: AbortSignal.any([signal, AbortSignal.timeout((LONGPOLL_WAIT_S + 10) * 1000)]),
          },
        );
      } catch (error) {
        if (signal.aborted) throw abortError(signal, error);
        consecutiveErrors++;
        await sleepAbortable(backoffMs(consecutiveErrors), signal);
        continue;
      }
      if (response.status === 200) {
        return {
          response: (await readJson(response)) as HubStoredResponse,
          notices: [...notices].map(([round_, revision]) => ({ round: round_, revision })),
        };
      }
      if (response.status === 202) {
        const pending = (await readJson(response).catch(() => null)) as {
          revised?: { round?: unknown; revision?: unknown };
        } | null;
        if (
          typeof pending?.revised?.round === "number" &&
          typeof pending.revised.revision === "number"
        ) {
          // Keep the highest revision seen per round; bursts collapse.
          const { round: noticed, revision } = pending.revised;
          notices.set(noticed, Math.max(revision, notices.get(noticed) ?? 0));
        }
        consecutiveErrors = 0;
        continue;
      }
      if (response.status === 429) {
        await sleepAbortable(retryAfterMs(response), signal);
        continue;
      }
      if (isTransient(response.status)) {
        consecutiveErrors++;
        await sleepAbortable(backoffMs(consecutiveErrors), signal);
        continue;
      }
      throw await hubError(response);
    }
  }

  /**
   * Submit the round's answers. A 409 is a result, not a failure: it carries
   * the response that got there first.
   * @param sessionId - the owning Hub session.
   * @param round - the round being answered.
   * @param input - the answers in the Hub wire shape.
   * @param signal - cancellation lifetime of the call.
   * @returns whether the submission was stored, or the stored winner on conflict.
   */
  async submitResponse(
    sessionId: string,
    round: number,
    input: HubResponseInput,
    signal: AbortSignal,
  ): Promise<HubSubmitResult> {
    const response = await this.#send(
      "POST",
      `sessions/${sessionId}/rounds/${round}/response`,
      input,
      signal,
    );
    if (response.status === 409) {
      const body = (await readJson(response)) as { response: HubStoredResponse };
      return { kind: "conflict", response: body.response };
    }
    if (response.status === 201)
      return { kind: "created", response: (await readJson(response)) as HubStoredResponse };
    throw await hubError(response);
  }

  /**
   * Revise the round's stored answers (latest wins). The caller uses this to
   * converge the Hub onto the session log after a lost race.
   * @param sessionId - the owning Hub session.
   * @param round - the round being revised.
   * @param input - the replacement answers.
   * @param signal - cancellation lifetime of the call.
   * @returns the newly stored response.
   */
  async reviseResponse(
    sessionId: string,
    round: number,
    input: HubResponseInput,
    signal: AbortSignal,
  ): Promise<HubStoredResponse> {
    const response = await this.#send(
      "PUT",
      `sessions/${sessionId}/rounds/${round}/response`,
      input,
      signal,
    );
    if (response.status === 200) return (await readJson(response)) as HubStoredResponse;
    throw await hubError(response);
  }

  /**
   * Cancel the Hub session. Terminal idempotency makes every already-settled
   * outcome (200 same state, 409 other terminal state) and every gone session
   * (404, 410) a success for this best-effort call.
   * @param sessionId - the session to cancel.
   * @param signal - cancellation lifetime of the call.
   */
  async cancelSession(sessionId: string, signal: AbortSignal): Promise<void> {
    const response = await this.#send(
      "PATCH",
      `sessions/${sessionId}`,
      { status: "cancelled", reason: "agent_aborted", actor: "agent" },
      signal,
    );
    await response.arrayBuffer().catch(() => new ArrayBuffer(0));
    if (response.status > 210 && response.status !== 404 && response.status !== 410) {
      throw await hubError(response);
    }
  }

  async #send(method: string, path: string, body: unknown, signal: AbortSignal): Promise<Response> {
    return this.#fetch(`${this.#baseUrl}/v1/${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(method === "POST" ? { "idempotency-key": randomUUID() } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    });
  }

  /** GET a JSON document, retrying transient failures until aborted. */
  async #getJsonWithRetry(path: string, signal: AbortSignal): Promise<unknown> {
    let consecutiveErrors = 0;
    while (true) {
      let response: Response;
      try {
        response = await this.#fetch(`${this.#baseUrl}/v1/${path}`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
        });
      } catch (error) {
        if (signal.aborted) throw abortError(signal, error);
        consecutiveErrors++;
        await sleepAbortable(backoffMs(consecutiveErrors), signal);
        continue;
      }
      if (response.status === 200) return await readJson(response);
      if (response.status === 429) {
        await sleepAbortable(retryAfterMs(response), signal);
        continue;
      }
      if (isTransient(response.status)) {
        consecutiveErrors++;
        await sleepAbortable(backoffMs(consecutiveErrors), signal);
        continue;
      }
      throw await hubError(response);
    }
  }

  async #requestJsonWithRetry(
    method: "POST",
    path: string,
    body: unknown,
    signal: AbortSignal,
  ): Promise<unknown> {
    let consecutiveErrors = 0;
    while (true) {
      let response: Response;
      try {
        response = await this.#send(method, path, body, signal);
      } catch (error) {
        if (signal.aborted) throw abortError(signal, error);
        consecutiveErrors++;
        await sleepAbortable(backoffMs(consecutiveErrors), signal);
        continue;
      }
      if (response.status === 201) return await readJson(response);
      if (response.status === 429) {
        await sleepAbortable(retryAfterMs(response), signal);
        continue;
      }
      if (isTransient(response.status)) {
        consecutiveErrors++;
        await sleepAbortable(backoffMs(consecutiveErrors), signal);
        continue;
      }
      throw await hubError(response);
    }
  }
}
