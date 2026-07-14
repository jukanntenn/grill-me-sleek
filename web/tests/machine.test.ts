import { describe, it, expect } from "vitest";
import { reducer, isTerminal, type State, type Action } from "../src/hooks/useGrillingMachine";
import type { RoundData } from "../src/types";

const mockRound: RoundData = {
  round: 1,
  name: "Test",
  grilling: { name: "Test", questions: [] },
  response: null,
};

const mockSessionId = "sess-123";

function run(state: State, action: Action): State {
  return reducer(state, action);
}

describe("reducer: BOOT → FETCH_CURRENT", () => {
  it("BOOT_NO_SESSION → ERROR_PAGE", () => {
    const result = run(
      { type: "BOOT" },
      { type: "BOOT_NO_SESSION", message: "invalid" },
    );
    expect(result.type).toBe("ERROR_PAGE");
    expect((result as { message: string }).message).toBe("invalid");
  });

  it("FETCH_START → FETCH_CURRENT", () => {
    const result = run(
      { type: "BOOT" },
      { type: "FETCH_START", sessionId: mockSessionId },
    );
    expect(result.type).toBe("FETCH_CURRENT");
    expect((result as { sessionId: string }).sessionId).toBe(mockSessionId);
  });
});

describe("reducer: FETCH_CURRENT outcomes", () => {
  const fetchState: State = { type: "FETCH_CURRENT", sessionId: mockSessionId };

  it("FETCH_SUCCESS → RENDER_QUESTIONS", () => {
    const result = run(fetchState, { type: "FETCH_SUCCESS", round: mockRound, sessionId: mockSessionId });
    expect(result.type).toBe("RENDER_QUESTIONS");
  });

  it("FETCH_NOT_FOUND → ERROR_PAGE", () => {
    const result = run(fetchState, { type: "FETCH_NOT_FOUND" });
    expect(result.type).toBe("ERROR_PAGE");
  });

  it("FETCH_GONE completed → PAGE_COMPLETED", () => {
    const result = run(fetchState, { type: "FETCH_GONE", detail: "completed" });
    expect(result.type).toBe("PAGE_COMPLETED");
  });

  it("FETCH_GONE cancelled → PAGE_CANCELLED", () => {
    const result = run(fetchState, { type: "FETCH_GONE", detail: "cancelled" });
    expect(result.type).toBe("PAGE_CANCELLED");
  });

  it("FETCH_GONE expired → PAGE_EXPIRED", () => {
    const result = run(fetchState, { type: "FETCH_GONE", detail: "expired" });
    expect(result.type).toBe("PAGE_EXPIRED");
  });

  it("FETCH_RETRY → RECONNECTING", () => {
    const result = run(fetchState, { type: "FETCH_RETRY", sessionId: mockSessionId, attempt: 1 });
    expect(result.type).toBe("RECONNECTING");
    expect((result as { attempt: number }).attempt).toBe(1);
  });
});

describe("reducer: RENDER_QUESTIONS → submit", () => {
  const renderState: State = {
    type: "RENDER_QUESTIONS",
    round: mockRound,
    sessionId: mockSessionId,
  };

  it("ENTER_VALIDATE → VALIDATE", () => {
    const result = run(renderState, { type: "ENTER_VALIDATE", round: mockRound, sessionId: mockSessionId });
    expect(result.type).toBe("VALIDATE");
  });

  it("SUBMIT_SUCCESS → WAIT_NEXT_ROUND", () => {
    const result = run(renderState, { type: "SUBMIT_SUCCESS", sessionId: mockSessionId, currentRound: 1 });
    expect(result.type).toBe("WAIT_NEXT_ROUND");
  });

  it("SUBMIT_CONFLICT → WAIT_NEXT_ROUND (409 recovery)", () => {
    const result = run(renderState, { type: "SUBMIT_CONFLICT", sessionId: mockSessionId, currentRound: 1 });
    expect(result.type).toBe("WAIT_NEXT_ROUND");
  });
});

describe("reducer: SSE events", () => {
  it("SSE_COMPLETED → PAGE_COMPLETED", () => {
    const result = run(
      { type: "WAIT_NEXT_ROUND", sessionId: mockSessionId, currentRound: 1 },
      { type: "SSE_COMPLETED" },
    );
    expect(result.type).toBe("PAGE_COMPLETED");
  });

  it("SSE_CANCELLED → PAGE_CANCELLED with reason", () => {
    const result = run(
      { type: "WAIT_NEXT_ROUND", sessionId: mockSessionId, currentRound: 1 },
      { type: "SSE_CANCELLED", reason: "user_cancelled" },
    );
    expect(result.type).toBe("PAGE_CANCELLED");
    expect((result as { reason?: string }).reason).toBe("user_cancelled");
  });

  it("SSE_EXPIRED → PAGE_EXPIRED", () => {
    const result = run(
      { type: "WAIT_NEXT_ROUND", sessionId: mockSessionId, currentRound: 1 },
      { type: "SSE_EXPIRED" },
    );
    expect(result.type).toBe("PAGE_EXPIRED");
  });

  it("SSE_ROUND_CREATED does not change state (handled by effect layer)", () => {
    const state: State = { type: "WAIT_NEXT_ROUND", sessionId: mockSessionId, currentRound: 1 };
    const result = run(state, { type: "SSE_ROUND_CREATED" });
    expect(result).toBe(state);
  });
});

describe("reducer: RECONNECTING", () => {
  it("RECONNECT_SUCCESS → RENDER_QUESTIONS", () => {
    const result = run(
      { type: "RECONNECTING", sessionId: mockSessionId, attempt: 2, since: 1000 },
      { type: "RECONNECT_SUCCESS", round: mockRound, sessionId: mockSessionId },
    );
    expect(result.type).toBe("RENDER_QUESTIONS");
  });

  it("RECONNECT_FAILED → PAGE_RECONNECT_FAILED", () => {
    const result = run(
      { type: "RECONNECTING", sessionId: mockSessionId, attempt: 10, since: 1000 },
      { type: "RECONNECT_FAILED" },
    );
    expect(result.type).toBe("PAGE_RECONNECT_FAILED");
  });
});

describe("isTerminal", () => {
  it("returns true for all terminal states", () => {
    expect(isTerminal({ type: "PAGE_COMPLETED" })).toBe(true);
    expect(isTerminal({ type: "PAGE_CANCELLED" })).toBe(true);
    expect(isTerminal({ type: "PAGE_EXPIRED" })).toBe(true);
    expect(isTerminal({ type: "ERROR_PAGE", message: "err" })).toBe(true);
    expect(isTerminal({ type: "PAGE_RECONNECT_FAILED" })).toBe(true);
  });

  it("returns false for non-terminal states", () => {
    expect(isTerminal({ type: "BOOT" })).toBe(false);
    expect(isTerminal({ type: "FETCH_CURRENT", sessionId: "x" })).toBe(false);
    expect(isTerminal({ type: "RENDER_QUESTIONS", round: mockRound, sessionId: "x" })).toBe(false);
    expect(isTerminal({ type: "WAIT_NEXT_ROUND", sessionId: "x", currentRound: 1 })).toBe(false);
    expect(isTerminal({ type: "RECONNECTING", sessionId: "x", attempt: 1, since: 0 })).toBe(false);
  });
});
