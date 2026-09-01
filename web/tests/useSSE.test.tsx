// useSSE round-lifecycle handling — the paths that keep the page truthful
// when answers and rounds arrive from elsewhere (agent-side proxy submit,
// another tab): response.created syncs a dead form away, round.created
// switches along without a modal, and viewing history is never yanked.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { useSSE, type SessionNotice } from "../src/hooks/useSSE";
import type { State } from "../src/hooks/useGrillingMachine";
import type { RoundData } from "../src/types";

vi.mock("../src/lib/api", () => ({
  fetchCurrent: vi.fn(),
  sseUrl: (sessionId: string) => `/v1/sessions/${sessionId}/events`,
}));

import { fetchCurrent } from "../src/lib/api";

const unansweredRound: RoundData = {
  round: 2,
  name: "Branch 2",
  grilling: { name: "Branch 2", questions: [] },
  response: null,
};

const answeredRound: RoundData = {
  ...unansweredRound,
  round: 1,
  response: { round: 1, answers: {}, submitted_at: "2026-09-01T00:00:00Z" },
};

/** Minimal EventSource double: capture listeners, fire named events. */
class MockEventSource {
  static instances: MockEventSource[] = [];
  readonly listeners = new Map<string, (event: { data: string }) => void>();
  closed = false;

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(name: string, handler: (event: { data: string }) => void) {
    this.listeners.set(name, handler);
  }

  emit(name: string, data: unknown) {
    this.listeners.get(name)?.({ data: JSON.stringify(data) });
  }

  close() {
    this.closed = true;
  }
}

function probe(
  state: State,
  onNotice?: (notice: SessionNotice) => void,
): { dispatch: ReturnType<typeof vi.fn> } {
  const dispatch = vi.fn();
  function Probe() {
    const stateRef = useRef<State>(state);
    stateRef.current = state;
    useSSE({ sessionId: "s1", stateRef, dispatch, onNotice });
    return null;
  }
  render(<Probe />);
  return { dispatch };
}

describe("useSSE: response.created (answered elsewhere)", () => {
  beforeEach(() => {
    vi.mocked(fetchCurrent).mockReset();
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    MockEventSource.instances.length = 0;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("syncs a still-rendered form onto the answered round and notifies", async () => {
    vi.mocked(fetchCurrent).mockResolvedValue({ ok: true, round: answeredRound });
    const onNotice = vi.fn();
    const { dispatch } = probe(
      { type: "RENDER_QUESTIONS", round: { ...answeredRound, response: null }, sessionId: "s1" },
      onNotice,
    );

    MockEventSource.instances[0]!.emit("response.created", { round: 1 });

    await waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({
        type: "FETCH_SUCCESS",
        round: answeredRound,
        sessionId: "s1",
      });
    });
    expect(onNotice).toHaveBeenCalledWith({ kind: "answered-elsewhere", round: 1 });
  });

  it("is a no-op ack while waiting after our own submit", async () => {
    const { dispatch } = probe({ type: "WAIT_NEXT_ROUND", sessionId: "s1", currentRound: 1 });
    MockEventSource.instances[0]!.emit("response.created", { round: 1 });
    expect(dispatch).not.toHaveBeenCalled();
    expect(fetchCurrent).not.toHaveBeenCalled();
  });

  it("notifies without yanking while viewing history", async () => {
    const onNotice = vi.fn();
    probe({ type: "REVIEW_ROUND", round: answeredRound, sessionId: "s1" }, onNotice);
    MockEventSource.instances[0]!.emit("response.created", { round: 2 });
    expect(onNotice).toHaveBeenCalledWith({ kind: "answered-elsewhere", round: 2 });
    expect(fetchCurrent).not.toHaveBeenCalled();
  });
});

describe("useSSE: round.created (session advanced)", () => {
  beforeEach(() => {
    vi.mocked(fetchCurrent).mockReset();
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    MockEventSource.instances.length = 0;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("switches a waiting page silently", async () => {
    vi.mocked(fetchCurrent).mockResolvedValue({ ok: true, round: unansweredRound });
    const onNotice = vi.fn();
    const { dispatch } = probe(
      { type: "WAIT_NEXT_ROUND", sessionId: "s1", currentRound: 1 },
      onNotice,
    );

    MockEventSource.instances[0]!.emit("round.created", { round: 2 });

    await waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({
        type: "FETCH_SUCCESS",
        round: unansweredRound,
        sessionId: "s1",
      });
    });
    expect(onNotice).not.toHaveBeenCalled();
  });

  it("switches a form page and notifies", async () => {
    vi.mocked(fetchCurrent).mockResolvedValue({ ok: true, round: unansweredRound });
    const onNotice = vi.fn();
    const { dispatch } = probe(
      { type: "RENDER_QUESTIONS", round: answeredRound, sessionId: "s1" },
      onNotice,
    );

    MockEventSource.instances[0]!.emit("round.created", { round: 2 });

    await waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({
        type: "FETCH_SUCCESS",
        round: unansweredRound,
        sessionId: "s1",
      });
    });
    expect(onNotice).toHaveBeenCalledWith({ kind: "switched-round", round: 2 });
  });

  it("never yanks a history view, only notifies", async () => {
    const onNotice = vi.fn();
    probe({ type: "REVIEW_ROUND", round: answeredRound, sessionId: "s1" }, onNotice);

    MockEventSource.instances[0]!.emit("round.created", { round: 2 });

    expect(onNotice).toHaveBeenCalledWith({ kind: "new-round-history", round: 2 });
    expect(fetchCurrent).not.toHaveBeenCalled();
  });
});
