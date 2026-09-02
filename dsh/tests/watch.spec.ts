import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { parseSseBlock, startRevisionWatcher } from "../src/watch.ts";
import type { RevisionWatcher } from "../src/watch.ts";
import type { GrillingHubClient, HubRoundDetail, HubRoundSummary } from "../src/hub.ts";

const GRILLING = {
  name: "auth",
  additional_notes: {},
  questions: [{ id: "grill_auth", header: "Auth", text: "Which?", type: "single" as const }],
};

function roundDetail(revision: number): HubRoundDetail {
  return {
    round: 1,
    name: "auth",
    grilling: GRILLING,
    response: {
      round: 1,
      answers: { grill_auth: { selected: "oauth2" } },
      submitted_at: "t",
      revision,
    },
  };
}

/** An agent stand-in recording followup/inject deliveries. */
function fakeAgent(status: "idle" | "running" = "idle") {
  return {
    status,
    followup: vi.fn(),
    inject: vi.fn(),
  };
}

/** A context stand-in: logging spies and collected dispose effects. */
function fakeContext() {
  const effects: (() => void)[] = [];
  const warn = vi.fn();
  const info = vi.fn();
  const ctx = {
    logger: { info, warn },
    effect: (register: () => () => void) => {
      effects.push(register());
    },
  };
  return { ctx, effects, warn, info };
}

/**
 * A scripted SSE transport: every accepted connection hands the watcher a
 * fresh stream whose blocks the test pushes by hand. `plans` scripts
 * connection outcomes (statuses or thrown errors) ahead of the streams.
 */
class SseTransport {
  readonly fetch = vi.fn(async (): Promise<Response> => {
    const plan = this.#plans.length > 1 ? this.#plans.shift() : this.#plans[0];
    if (plan instanceof Error) throw plan;
    if (typeof plan === "number") {
      return new Response("gone", { status: plan });
    }
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.#current.controller = controller;
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  });

  readonly #current: { controller?: ReadableStreamDefaultController<Uint8Array> | undefined } = {};
  #plans: (number | Error | "stream")[] = ["stream"];

  /** Script connection outcomes; the last entry repeats for further connects. */
  script(plans: (number | Error | "stream")[]): void {
    this.#plans = plans;
  }

  get connections(): number {
    return this.fetch.mock.calls.length;
  }

  /** Push one SSE event block onto the current stream. */
  push(event: string, data: unknown): void {
    if (this.#current.controller === undefined) throw new Error("no open stream");
    this.#current.controller.enqueue(
      new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
    );
  }

  /** Push a raw block fragment (parser edge cases). */
  pushRaw(text: string): void {
    if (this.#current.controller === undefined) throw new Error("no open stream");
    this.#current.controller.enqueue(new TextEncoder().encode(text));
  }

  /** End the current stream cleanly (a drop the watcher must reconnect from). */
  drop(): void {
    const controller = this.#current.controller;
    this.#current.controller = undefined;
    try {
      controller?.close();
    } catch {
      // Already closed by a prior drop; the reconnect still proceeds.
    }
  }
}

interface WatchRig {
  watcher: RevisionWatcher;
  transport: SseTransport;
  agent: ReturnType<typeof fakeAgent>;
  hub: { getRound: ReturnType<typeof vi.fn>; listRounds: ReturnType<typeof vi.fn> };
  effects: (() => void)[];
  warnings: () => string;
}

/** Start a watcher over the fakes; the hub is scripted per test. */
function rig(
  over: {
    detail?: HubRoundDetail | Error;
    summaries?: HubRoundSummary[] | Error;
    agent?: ReturnType<typeof fakeAgent>;
  } = {},
): WatchRig {
  const agent = over.agent ?? fakeAgent();
  const { ctx, effects, warn } = fakeContext();
  const getRound = vi.fn(async () =>
    over.detail instanceof Error ? Promise.reject(over.detail) : Promise.resolve(over.detail),
  );
  const listRounds = vi.fn(async () =>
    over.summaries instanceof Error
      ? Promise.reject(over.summaries)
      : Promise.resolve(over.summaries ?? []),
  );
  const hub = {
    eventsUrl: (sessionId: string) => `https://hub/v1/sessions/${sessionId}/events`,
    getRound,
    listRounds,
  } as unknown as GrillingHubClient;
  const transport = new SseTransport();
  const watcher = startRevisionWatcher({
    ctx: ctx as unknown as Context,
    hub,
    agent: agent as unknown as Agent,
    sessionId: "s1",
    watermarks: new Map(),
    fetch: transport.fetch as unknown as typeof fetch,
  });
  return {
    watcher,
    transport,
    agent,
    hub: { getRound, listRounds },
    effects,
    warnings: () => warn.mock.calls.map((call) => String(call[0])).join("\n"),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("parseSseBlock", () => {
  it("parses event and data, joining continuation data lines", () => {
    expect(parseSseBlock('event: response.revised\ndata: {"round":1}')).toEqual({
      event: "response.revised",
      data: '{"round":1}',
    });
    expect(parseSseBlock("data: a\ndata: b")).toEqual({ event: "message", data: "a\nb" });
  });

  it("skips comments and id/retry fields, tolerates missing and padded colons", () => {
    expect(parseSseBlock(": keepalive")).toBeUndefined();
    expect(parseSseBlock("id: 7\nretry: 3000")).toBeUndefined();
    expect(parseSseBlock("data:no-space")).toEqual({ event: "message", data: "no-space" });
    expect(parseSseBlock("data")).toEqual({ event: "message", data: "" });
  });
});

describe("startRevisionWatcher", () => {
  it("delivers a revision to an idle agent by followup and stamps the watermark", async () => {
    const state = rig({ detail: roundDetail(2) });
    await vi.advanceTimersByTimeAsync(0);
    state.transport.push("response.revised", { round: 1, revision: 2 });
    await vi.advanceTimersByTimeAsync(0);

    expect(state.agent.followup).toHaveBeenCalledOnce();
    const message = state.agent.followup.mock.calls[0]![0] as {
      role: string;
      content: { type: string; text: string }[];
      source: { kind: string; plugin: string; form: string; summary: string };
    };
    expect(message.role).toBe("user");
    expect(message.source).toMatchObject({
      kind: "plugin",
      plugin: "tool-grill-user",
      form: "notice",
    });
    expect(message.content[0]!.text).toContain("revision 2");
    expect(message.content[0]!.text).toContain('"grill_auth"');
    expect(state.agent.inject).not.toHaveBeenCalled();
  });

  it("injects instead when the agent is busy", async () => {
    const state = rig({ detail: roundDetail(2), agent: fakeAgent("running") });
    await vi.advanceTimersByTimeAsync(0);
    state.transport.push("response.revised", { round: 1, revision: 2 });
    await vi.advanceTimersByTimeAsync(0);

    expect(state.agent.inject).toHaveBeenCalledOnce();
    expect(state.agent.followup).not.toHaveBeenCalled();
  });

  it("skips a revision the watermark already covers, without refetching", async () => {
    const state = rig({ detail: roundDetail(2) });
    await vi.advanceTimersByTimeAsync(0);
    state.transport.push("response.revised", { round: 1, revision: 2 });
    await vi.advanceTimersByTimeAsync(0);
    state.transport.push("response.revised", { round: 1, revision: 2 });
    await vi.advanceTimersByTimeAsync(0);

    expect(state.agent.followup).toHaveBeenCalledOnce();
    expect(state.hub.getRound).toHaveBeenCalledOnce();
  });

  it("caps consecutive idle wakes, falling back to inject until activity refills", async () => {
    const state = rig({ agent: fakeAgent("idle") });
    const details = new Map([
      [1, roundDetail(2)],
      [2, roundDetail(1)],
      [3, roundDetail(1)],
      [4, roundDetail(1)],
      [5, roundDetail(1)],
    ]);
    state.hub.getRound.mockImplementation(async (_sessionId: string, round: number) =>
      details.get(round),
    );
    await vi.advanceTimersByTimeAsync(0);
    for (const round of [1, 2, 3, 4]) {
      state.transport.push("response.revised", { round, revision: 1 });
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(state.agent.followup).toHaveBeenCalledTimes(3);
    expect(state.agent.inject).toHaveBeenCalledOnce();

    state.watcher.noteActivity();
    state.transport.push("response.revised", { round: 5, revision: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(state.agent.followup).toHaveBeenCalledTimes(4);
  });

  it("resyncs from the round summaries on every (re)connection", async () => {
    const state = rig({
      summaries: [{ round: 1, name: "auth", has_response: true, revision: 3 }],
    });
    state.hub.getRound.mockImplementation(async () => roundDetail(3));
    await vi.advanceTimersByTimeAsync(0);

    expect(state.hub.listRounds).toHaveBeenCalledOnce();
    expect(state.hub.getRound).toHaveBeenCalledWith("s1", 1, expect.any(AbortSignal));
    expect(state.agent.followup).toHaveBeenCalledOnce();

    // A drop reconnects; the replayed summaries are already covered.
    state.transport.drop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(state.transport.connections).toBe(2);
    expect(state.hub.listRounds).toHaveBeenCalledTimes(2);
    expect(state.agent.followup).toHaveBeenCalledOnce();
  });

  it("stops without reconnecting when the Hub refuses the stream", async () => {
    const state = rig({});
    await vi.advanceTimersByTimeAsync(0);
    state.transport.script([410]);
    state.transport.drop();
    await vi.advanceTimersByTimeAsync(1000);

    expect(state.transport.connections).toBe(2);
    expect(state.warnings()).toContain("stream refused (410)");
    state.transport.drop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state.transport.connections).toBe(2);
  });

  it("reconnects with backoff after a failed connect, then resyncs", async () => {
    const state = rig({
      summaries: [{ round: 1, name: "auth", has_response: true, revision: 2 }],
    });
    state.hub.getRound.mockImplementation(async () => roundDetail(2));
    await vi.advanceTimersByTimeAsync(0);
    state.transport.script([new Error("ECONNREFUSED"), new Error("ECONNREFUSED"), "stream"]);
    state.transport.drop();
    // Drop retry 1s, then failed-connect backoff 1s + 2s.
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(0);

    expect(state.transport.connections).toBe(4);
    expect(state.warnings()).toContain("connect failed (attempt 1)");
    expect(state.agent.followup).toHaveBeenCalledOnce();
  });

  it("stops on a terminal event and ignores everything after", async () => {
    const state = rig({ detail: roundDetail(2) });
    await vi.advanceTimersByTimeAsync(0);
    state.transport.push("session.completed", { session_id: "s1" });
    state.transport.push("response.revised", { round: 1, revision: 2 });
    await vi.advanceTimersByTimeAsync(0);

    expect(state.agent.followup).not.toHaveBeenCalled();
    expect(state.watcher.stop()).toBeUndefined();
  });

  it("warns and leaves the watermark alone when a round fetch fails", async () => {
    const state = rig({ detail: new Error("hub down") });
    await vi.advanceTimersByTimeAsync(0);
    state.transport.push("response.revised", { round: 1, revision: 2 });
    await vi.advanceTimersByTimeAsync(0);

    expect(state.agent.followup).not.toHaveBeenCalled();
    expect(state.warnings()).toContain("could not deliver round 1");
  });

  it("ignores malformed and mis-typed event payloads", async () => {
    const state = rig({ detail: roundDetail(2) });
    await vi.advanceTimersByTimeAsync(0);
    state.transport.pushRaw("event: response.revised\ndata: not-json{\n\n");
    state.transport.pushRaw(
      `event: response.revised\ndata: ${JSON.stringify({ round: "one", revision: "two" })}\n\n`,
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(state.hub.getRound).not.toHaveBeenCalled();
  });

  it("closes the stream when the plugin context disposes", async () => {
    const state = rig({});
    await vi.advanceTimersByTimeAsync(0);
    for (const dispose of state.effects) dispose();

    expect(state.watcher.stop()).toBeUndefined();
    const before = state.transport.connections;
    state.transport.drop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state.transport.connections).toBe(before);
  });
});
