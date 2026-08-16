import { describe, it, expect } from "vitest";
import { reducer, type State, type Action } from "../src/hooks/useGrillingMachine";
import type { RoundData } from "../src/types";

const answeredRound: RoundData = {
  round: 1,
  name: "R1",
  grilling: { name: "Plan", questions: [] },
  response: {
    round: 1,
    answers: { q1: { selected: "A" } },
    submitted_at: "2026-08-16T00:00:00Z",
    revision: 1,
  },
};

const sid = "sess-123";

function run(state: State, action: Action): State {
  return reducer(state, action);
}

describe("reducer: round review & revise", () => {
  const waiting: State = { type: "WAIT_NEXT_ROUND", sessionId: sid, currentRound: 2 };

  it("VIEW_ROUND on an answered round → REVIEW_ROUND", () => {
    const result = run(waiting, { type: "VIEW_ROUND", round: answeredRound, sessionId: sid });
    expect(result).toEqual({ type: "REVIEW_ROUND", round: answeredRound, sessionId: sid });
  });

  it("VIEW_ROUND on an unanswered round is a no-op", () => {
    const unanswered: RoundData = { ...answeredRound, response: null };
    const result = run(waiting, { type: "VIEW_ROUND", round: unanswered, sessionId: sid });
    expect(result).toBe(waiting);
  });

  it("ENTER_REVISE from REVIEW_ROUND → REVISE_ROUND (same round)", () => {
    const review = run(waiting, { type: "VIEW_ROUND", round: answeredRound, sessionId: sid });
    const result = run(review, { type: "ENTER_REVISE" });
    expect(result).toEqual({ type: "REVISE_ROUND", round: answeredRound, sessionId: sid });
  });

  it("ENTER_REVISE outside REVIEW_ROUND is a no-op", () => {
    const result = run(waiting, { type: "ENTER_REVISE" });
    expect(result).toBe(waiting);
  });

  it("CANCEL_REVISE from REVISE_ROUND → REVIEW_ROUND", () => {
    const review = run(waiting, { type: "VIEW_ROUND", round: answeredRound, sessionId: sid });
    const revise = run(review, { type: "ENTER_REVISE" });
    const result = run(revise, { type: "CANCEL_REVISE" });
    expect(result).toEqual(review);
  });

  it("CANCEL_REVISE outside REVISE_ROUND is a no-op", () => {
    const result = run(waiting, { type: "CANCEL_REVISE" });
    expect(result).toBe(waiting);
  });

  it("FETCH_START from REVIEW/REVISE returns to FETCH_CURRENT", () => {
    const review = run(waiting, { type: "VIEW_ROUND", round: answeredRound, sessionId: sid });
    const result = run(review, { type: "FETCH_START", sessionId: sid });
    expect(result).toEqual({ type: "FETCH_CURRENT", sessionId: sid });
  });
});
