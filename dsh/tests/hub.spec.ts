import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GrillingHubClient, GrillingHubError } from "../src/hub.ts";
import type { HubGrilling } from "../src/hub.ts";

const GRILLING: HubGrilling = {
  name: "auth",
  additional_notes: {},
  questions: [
    {
      id: "grill_auth",
      header: "Auth",
      text: "Which?",
      type: "single",
      options: [{ label: "a" }, { label: "b" }],
    },
  ],
};

const STORED = {
  round: 1,
  answers: { grill_auth: { selected: "a" } },
  submitted_at: "2026-08-31T00:00:00Z",
  revision: 1,
};

interface FakeResponseOptions {
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
  textError?: boolean;
  arrayBufferError?: boolean;
}

function fakeResponse(status: number, options: FakeResponseOptions = {}): Response {
  const body = options.text ?? (options.json !== undefined ? JSON.stringify(options.json) : "");
  return {
    status,
    headers: { get: (name: string) => options.headers?.[name] ?? null },
    text: async () => {
      if (options.textError) throw new Error("unreadable body");
      return body;
    },
    arrayBuffer: async () => {
      if (options.arrayBufferError) throw new Error("unreadable body");
      return new TextEncoder().encode(body).buffer;
    },
  } as unknown as Response;
}

type Step =
  Response | Error | ((url: string, init: RequestInit) => Response | Error | Promise<void>);

/** A fetch stub running a scripted queue; each call consumes one step. */
function scriptedFetch(steps: Step[]): {
  fetch: typeof globalThis.fetch;
  calls: { url: string; init: RequestInit }[];
} {
  const calls: { url: string; init: RequestInit }[] = [];
  let index = 0;
  const transport = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const step = steps[index];
    index++;
    if (step === undefined) throw new Error(`unexpected fetch #${index}: ${String(url)}`);
    if (step instanceof Error) throw step;
    if (typeof step === "function") {
      await step(String(url), init ?? {});
      throw new Error("scripted step function must respond through a later step");
    }
    return step;
  }) as typeof globalThis.fetch;
  return { fetch: transport, calls };
}

const signal = (): AbortSignal => new AbortController().signal;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("GrillingHubClient", () => {
  it("creates a session on 201 and strips a trailing slash from the base URL", async () => {
    const { fetch, calls } = scriptedFetch([
      fakeResponse(201, { json: { session_id: "s1", url: "https://x/#s1", current_round: 1 } }),
    ]);
    const client = new GrillingHubClient({ baseUrl: "https://hub.example.com///", fetch });
    await expect(client.createSession(GRILLING, signal())).resolves.toEqual({
      sessionId: "s1",
      url: "https://x/#s1",
      round: 1,
    });
    expect(calls[0]!.url).toBe("https://hub.example.com/v1/sessions");
    expect(calls[0]!.init.method).toBe("POST");
    expect((calls[0]!.init.headers as Record<string, string>)["idempotency-key"]).toBeDefined();
  });

  it("pushes a round on 201", async () => {
    const { fetch, calls } = scriptedFetch([fakeResponse(201, { json: { round: 2 } })]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch });
    await expect(client.pushRound("s1", GRILLING, signal())).resolves.toEqual({ round: 2 });
    expect(calls[0]!.url).toBe("https://hub/v1/sessions/s1/rounds");
  });

  it("retries a 429 on create honoring retry-after, then succeeds", async () => {
    const { fetch } = scriptedFetch([
      fakeResponse(429, { headers: { "retry-after": "1" } }),
      fakeResponse(201, { json: { session_id: "s1", url: "u", current_round: 1 } }),
    ]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch });
    const promise = client.createSession(GRILLING, signal());
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toMatchObject({ sessionId: "s1" });
  });

  it("falls back to five seconds when a 429 carries no usable retry-after", async () => {
    const { fetch } = scriptedFetch([
      fakeResponse(429),
      fakeResponse(201, { json: { session_id: "s1", url: "u", current_round: 1 } }),
    ]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch });
    const promise = client.createSession(GRILLING, signal());
    const early = Promise.race([
      promise.then(
        () => "done",
        () => "fail",
      ),
      new Promise<string>((r) => setTimeout(() => r("pending"), 0)),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    await expect(early).resolves.toBe("pending");
    await vi.advanceTimersByTimeAsync(5000);
    await expect(promise).resolves.toMatchObject({ sessionId: "s1" });
  });

  it("backs off a transient 500 on create, then succeeds", async () => {
    const { fetch } = scriptedFetch([
      fakeResponse(500, { text: "oops" }),
      fakeResponse(201, { json: { session_id: "s1", url: "u", current_round: 1 } }),
    ]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch });
    const promise = client.createSession(GRILLING, signal());
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toMatchObject({ sessionId: "s1" });
  });

  it.each([
    {
      label: "message body",
      response: fakeResponse(400, { json: { message: "grilling validation failed", status: 400 } }),
      fragment: "grilling validation failed",
    },
    {
      label: "detail body",
      response: fakeResponse(410, { json: { status: "gone", detail: "expired" } }),
      fragment: "expired",
    },
    {
      label: "status-only body",
      response: fakeResponse(410, { json: { status: "cancelled" } }),
      fragment: "cancelled",
    },
    {
      label: "JSON body without fields",
      response: fakeResponse(404, { json: {} }),
      fragment: "grilling hub 404: {}",
    },
    {
      label: "non-JSON body",
      response: fakeResponse(404, { text: "no such session" }),
      fragment: "no such session",
    },
    {
      label: "unreadable body",
      response: fakeResponse(404, { textError: true }),
      fragment: "grilling hub 404",
    },
  ])("surfaces a terminal create failure from a $label", async ({ response, fragment }) => {
    const { fetch } = scriptedFetch([response]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch });
    const failure = await client.createSession(GRILLING, signal()).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(GrillingHubError);
    expect((failure as GrillingHubError).message).toContain(fragment);
  });

  it("retries a network failure on create after backoff", async () => {
    const { fetch } = scriptedFetch([
      new Error("ECONNREFUSED"),
      fakeResponse(201, { json: { session_id: "s1", url: "u", current_round: 1 } }),
    ]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch });
    const promise = client.createSession(GRILLING, signal());
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toMatchObject({ sessionId: "s1" });
  });

  it("reports an aborted create as an abort, not a Hub failure", async () => {
    const { fetch } = scriptedFetch([new Error("socket hung up")]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch });
    const controller = new AbortController();
    controller.abort();
    await expect(client.createSession(GRILLING, controller.signal)).rejects.toThrow(
      "grilling hub link aborted",
    );
  });

  it("returns the stored response on a 200 poll and re-arms on a 202 window", async () => {
    const { fetch, calls } = scriptedFetch([
      fakeResponse(202, { json: { status: "pending" } }),
      fakeResponse(200, { json: STORED }),
    ]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch });
    await expect(client.awaitResponse("s1", 1, signal())).resolves.toEqual({
      response: STORED,
      notices: [],
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toContain("wait=55");
  });

  it("collects the revision notices 202 bodies carry for other rounds", async () => {
    const { fetch } = scriptedFetch([
      fakeResponse(202, { json: { status: "pending", revised: { round: 2, revision: 3 } } }),
      fakeResponse(202, { json: { status: "pending", revised: { round: 2, revision: 4 } } }),
      fakeResponse(202, { json: { status: "pending", revised: { round: 5, revision: 2 } } }),
      fakeResponse(202, { json: { status: "pending" } }),
      fakeResponse(202, { json: { status: "pending", revised: { round: "no" } } }),
      fakeResponse(200, { json: STORED }),
    ]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch });
    await expect(client.awaitResponse("s1", 1, signal())).resolves.toEqual({
      response: STORED,
      notices: [
        { round: 2, revision: 4 },
        { round: 5, revision: 2 },
      ],
    });
  });

  it("lists round summaries and fetches one round's detail on 200", async () => {
    const summaries = [{ round: 1, name: "auth", has_response: true, revision: 2 }];
    const detail = {
      round: 1,
      name: "auth",
      grilling: GRILLING,
      response: { ...STORED, revision: 2 },
    };
    const { fetch, calls } = scriptedFetch([
      fakeResponse(200, { json: summaries }),
      fakeResponse(200, { json: detail }),
    ]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch });
    await expect(client.listRounds("s1", signal())).resolves.toEqual(summaries);
    await expect(client.getRound("s1", 1, signal())).resolves.toEqual(detail);
    expect(calls[0]!.url).toBe("https://hub/v1/sessions/s1/rounds");
    expect(calls[1]!.url).toBe("https://hub/v1/sessions/s1/rounds/1");
    expect(client.eventsUrl("s1")).toBe("https://hub/v1/sessions/s1/events");
  });

  it("retries a transient 500 on a round detail fetch, then succeeds", async () => {
    const detail = { round: 1, grilling: GRILLING };
    const { fetch } = scriptedFetch([
      fakeResponse(500, { text: "oops" }),
      fakeResponse(200, { json: detail }),
    ]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch });
    const promise = client.getRound("s1", 1, signal());
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toEqual(detail);
  });

  it("surfaces a 404 round detail fetch without retrying", async () => {
    const { fetch } = scriptedFetch([
      fakeResponse(404, { json: { message: "no round", status: 404 } }),
    ]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch });
    await expect(client.getRound("s1", 9, signal())).rejects.toThrow("no round");
  });

  it("resets the error ladder after a clean 202 window", async () => {
    const { fetch } = scriptedFetch([
      fakeResponse(500),
      fakeResponse(202),
      fakeResponse(500),
      fakeResponse(200, { json: STORED }),
    ]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch });
    const promise = client.awaitResponse("s1", 1, signal());
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toEqual({ response: STORED, notices: [] });
  });

  it("honors retry-after on a rate-limited poll window, then answers", async () => {
    const { fetch } = scriptedFetch([
      fakeResponse(429, { headers: { "retry-after": "1" } }),
      fakeResponse(200, { json: STORED }),
    ]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch });
    const promise = client.awaitResponse("s1", 1, signal());
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toEqual({ response: STORED, notices: [] });
  });

  it("retries a network failure between polls after backoff, then answers", async () => {
    const { fetch } = scriptedFetch([new Error("ECONNRESET"), fakeResponse(200, { json: STORED })]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch });
    const promise = client.awaitResponse("s1", 1, signal());
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toEqual({ response: STORED, notices: [] });
  });

  it("throws a 410 GrillingHubError when the session went terminal during a poll", async () => {
    const { fetch } = scriptedFetch([fakeResponse(410, { json: { status: "expired" } })]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch });
    const failure = await client.awaitResponse("s1", 1, signal()).then(
      () => undefined,
      (error: unknown) => error as GrillingHubError,
    );
    if (!(failure instanceof GrillingHubError)) {
      throw new Error("expected a GrillingHubError");
    }
    expect(failure.status).toBe(410);
  });

  it("reports an abort raised while backing off between polls", async () => {
    const { fetch } = scriptedFetch([new Error("ECONNRESET"), fakeResponse(200, { json: STORED })]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch });
    const controller = new AbortController();
    const promise = client.awaitResponse("s1", 1, controller.signal);
    const aborting = promise.then(
      () => "done",
      (error: unknown) => error instanceof Error && error.message,
    );
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await vi.advanceTimersByTimeAsync(5000);
    await expect(aborting).resolves.toBe("grilling hub link aborted");
  });

  it("submits a created response and reports a conflict with the stored winner", async () => {
    const created = scriptedFetch([fakeResponse(201, { json: STORED })]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch: created.fetch });
    const input = { answers: { grill_auth: { selected: "a" } } };
    await expect(client.submitResponse("s1", 1, input, signal())).resolves.toEqual({
      kind: "created",
      response: STORED,
    });

    const conflicting = scriptedFetch([
      fakeResponse(409, {
        json: { message: "round 1 already submitted", status: 409, round: 1, response: STORED },
      }),
    ]);
    const loser = new GrillingHubClient({ baseUrl: "https://hub", fetch: conflicting.fetch });
    await expect(loser.submitResponse("s1", 1, input, signal())).resolves.toEqual({
      kind: "conflict",
      response: STORED,
    });
  });

  it("surfaces a rejected submission", async () => {
    const { fetch } = scriptedFetch([
      fakeResponse(400, { json: { message: "validation failed: multi", status: 400 } }),
    ]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch });
    await expect(client.submitResponse("s1", 1, { answers: {} }, signal())).rejects.toThrow(
      "validation failed: multi",
    );
  });

  it("revises on a 200 and surfaces anything else", async () => {
    const input = { answers: { grill_auth: { selected: "b" } } };
    const ok = scriptedFetch([
      fakeResponse(200, { json: { ...STORED, revision: 2, revised_at: "2026-08-31T01:00:00Z" } }),
    ]);
    await expect(
      new GrillingHubClient({ baseUrl: "https://hub", fetch: ok.fetch }).reviseResponse(
        "s1",
        1,
        input,
        signal(),
      ),
    ).resolves.toMatchObject({ revision: 2 });

    const gone = scriptedFetch([
      fakeResponse(409, { json: { message: "round 1 has no response yet", status: 409 } }),
    ]);
    await expect(
      new GrillingHubClient({ baseUrl: "https://hub", fetch: gone.fetch }).reviseResponse(
        "s1",
        1,
        input,
        signal(),
      ),
    ).rejects.toThrow("has no response yet");
  });

  it.each([
    { label: "acknowledged", status: 200 },
    { label: "unknown session", status: 404 },
    { label: "already terminal", status: 410 },
    { label: "rejected", status: 500 },
  ])("cancels a session ($label)", async ({ status }) => {
    const { fetch, calls } = scriptedFetch([
      fakeResponse(status, { json: { message: "no", status } }),
    ]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch });
    const promise = client.cancelSession("s1", signal());
    if (status === 500) await expect(promise).rejects.toThrow("grilling hub 500");
    else await expect(promise).resolves.toBeUndefined();
    expect(calls[0]!.init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      status: "cancelled",
      reason: "agent_aborted",
      actor: "agent",
    });
  });

  it("tolerates an unreadable cancel response body", async () => {
    const { fetch } = scriptedFetch([fakeResponse(200, { arrayBufferError: true })]);
    const client = new GrillingHubClient({ baseUrl: "https://hub", fetch });
    await expect(client.cancelSession("s1", signal())).resolves.toBeUndefined();
  });
});
