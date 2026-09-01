// Grilling state machine — useReducer implementation.
//
// The reducer is a pure function (testable in isolation); all side effects
// (fetch, SSE, timers) live in useSSE/useSubmit/lib/api.
//
// States:
//   BOOT → FETCH_CURRENT → RENDER_QUESTIONS ↔ VALIDATE → WAIT_NEXT_ROUND
//                         ↘ RECONNECTING → (FETCH_CURRENT | PAGE_RECONNECT_FAILED)
//   Terminal: PAGE_COMPLETED / PAGE_CANCELLED / PAGE_EXPIRED / ERROR_PAGE / PAGE_RECONNECT_FAILED
//
// A fetched "current" round that already carries a response never renders a
// form: the session is between rounds (the round was answered — by this page,
// another surface, or another tab), so the state machine routes to
// WAIT_NEXT_ROUND instead of showing a form whose submit could only 409.

import { useReducer, useRef, useCallback } from "react";
import type { RoundData, Answer, GoneBody } from "../types";

// ---------------------------------------------------------------------------
// State — discriminated union (DESIGN.md §902-945)
// ---------------------------------------------------------------------------

export type State =
  | { type: "BOOT" }
  | { type: "FETCH_CURRENT"; sessionId: string }
  | { type: "RENDER_QUESTIONS"; round: RoundData; sessionId: string }
  | { type: "VALIDATE"; round: RoundData; sessionId: string }
  | { type: "WAIT_NEXT_ROUND"; sessionId: string; currentRound: number }
  | { type: "REVIEW_ROUND"; round: RoundData; sessionId: string }
  | { type: "REVISE_ROUND"; round: RoundData; sessionId: string }
  | { type: "RECONNECTING"; sessionId: string; attempt: number; since: number }
  | { type: "PAGE_COMPLETED" }
  | { type: "PAGE_CANCELLED"; reason?: string }
  | { type: "PAGE_EXPIRED" }
  | { type: "ERROR_PAGE"; message: string }
  | { type: "PAGE_RECONNECT_FAILED" };

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type Action =
  | { type: "FETCH_START"; sessionId: string }
  | { type: "FETCH_SUCCESS"; round: RoundData; sessionId: string }
  | { type: "FETCH_NOT_FOUND" }
  | { type: "FETCH_GONE"; detail: GoneBody["detail"] }
  | { type: "FETCH_RETRY"; sessionId: string; attempt: number }
  | { type: "RECONNECT_SUCCESS"; round: RoundData; sessionId: string }
  | { type: "RECONNECT_FAILED" }
  | { type: "ENTER_VALIDATE"; round: RoundData; sessionId: string }
  | { type: "SUBMIT_SUCCESS"; sessionId: string; currentRound: number }
  | { type: "SUBMIT_CONFLICT"; sessionId: string; currentRound: number }
  | { type: "VIEW_ROUND"; round: RoundData; sessionId: string }
  | { type: "ENTER_REVISE" }
  | { type: "CANCEL_REVISE" }
  | { type: "SSE_ROUND_CREATED" }
  | { type: "SSE_COMPLETED" }
  | { type: "SSE_CANCELLED"; reason?: string }
  | { type: "SSE_EXPIRED" }
  | { type: "ERROR"; message: string }
  | { type: "BOOT_NO_SESSION"; message: string };

// ---------------------------------------------------------------------------
// Reducer — pure state transitions
// ---------------------------------------------------------------------------

/**
 * Route a fetched "current" round by whether it is answered: an unanswered
 * round renders its form; an answered one means the session is between
 * rounds — wait for the next push instead of rendering a dead form.
 */
function routeFetchedRound(sessionId: string, round: RoundData): State {
  return round.response
    ? { type: "WAIT_NEXT_ROUND", sessionId, currentRound: round.round }
    : { type: "RENDER_QUESTIONS", round, sessionId };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "BOOT_NO_SESSION":
      return { type: "ERROR_PAGE", message: action.message };

    case "FETCH_START":
      return { type: "FETCH_CURRENT", sessionId: action.sessionId };

    case "FETCH_SUCCESS":
      return routeFetchedRound(action.sessionId, action.round);

    case "FETCH_NOT_FOUND":
      return { type: "ERROR_PAGE", message: "not-found" };

    case "FETCH_GONE":
      switch (action.detail) {
        case "completed":
          return { type: "PAGE_COMPLETED" };
        case "cancelled":
          return { type: "PAGE_CANCELLED" };
        case "expired":
          return { type: "PAGE_EXPIRED" };
        default:
          return { type: "ERROR_PAGE", message: "session-ended" };
      }

    case "FETCH_RETRY":
      return {
        type: "RECONNECTING",
        sessionId: action.sessionId,
        attempt: action.attempt,
        since: Date.now(),
      };

    case "RECONNECT_SUCCESS":
      return routeFetchedRound(action.sessionId, action.round);

    case "RECONNECT_FAILED":
      return { type: "PAGE_RECONNECT_FAILED" };

    case "ENTER_VALIDATE":
      return { type: "VALIDATE", round: action.round, sessionId: action.sessionId };

    case "SUBMIT_SUCCESS":
      return {
        type: "WAIT_NEXT_ROUND",
        sessionId: action.sessionId,
        currentRound: action.currentRound,
      };

    case "SUBMIT_CONFLICT":
      // 409 — already submitted, enter waiting (DESIGN.md §1369-1388)
      return {
        type: "WAIT_NEXT_ROUND",
        sessionId: action.sessionId,
        currentRound: action.currentRound,
      };

    case "SSE_COMPLETED":
      return { type: "PAGE_COMPLETED" };

    case "SSE_CANCELLED":
      return { type: "PAGE_CANCELLED", reason: action.reason };

    case "SSE_EXPIRED":
      return { type: "PAGE_EXPIRED" };

    case "SSE_ROUND_CREATED":
      // Handled by the effect layer (confirm dialog + fetch), not a pure
      // state change — the effect will dispatch FETCH_START. Return unchanged.
      return state;

    case "VIEW_ROUND":
      // Only answered rounds have something to review.
      if (!action.round.response) return state;
      return { type: "REVIEW_ROUND", round: action.round, sessionId: action.sessionId };

    case "ENTER_REVISE":
      if (state.type !== "REVIEW_ROUND") return state;
      return { type: "REVISE_ROUND", round: state.round, sessionId: state.sessionId };

    case "CANCEL_REVISE":
      if (state.type !== "REVISE_ROUND") return state;
      return { type: "REVIEW_ROUND", round: state.round, sessionId: state.sessionId };

    case "ERROR":
      return { type: "ERROR_PAGE", message: action.message };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isTerminal(s: State): boolean {
  return (
    s.type === "PAGE_COMPLETED" ||
    s.type === "PAGE_CANCELLED" ||
    s.type === "PAGE_EXPIRED" ||
    s.type === "ERROR_PAGE" ||
    s.type === "PAGE_RECONNECT_FAILED"
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Pending submission, kept across failed POSTs so retry resubmits the same data. */
export interface PendingSubmit {
  sessionId: string;
  round: number;
  answers: Record<string, Answer>;
  additionalNotes?: string;
}

export function useGrillingMachine() {
  const [state, dispatch] = useReducer(reducer, { type: "BOOT" });

  // Form values cache: round seq → answers (survives round switches + re-renders).
  const formCacheRef = useRef<Map<number, Record<string, Answer>>>(new Map());

  // Pending submission for retry (DESIGN.md §971).
  const pendingSubmitRef = useRef<PendingSubmit | null>(null);

  const setFormCache = useCallback((round: number, values: Record<string, Answer>) => {
    formCacheRef.current.set(round, values);
  }, []);

  const getFormCache = useCallback((round: number): Record<string, Answer> | undefined => {
    return formCacheRef.current.get(round);
  }, []);

  const setPendingSubmit = useCallback((p: PendingSubmit | null) => {
    pendingSubmitRef.current = p;
  }, []);

  const getPendingSubmit = useCallback((): PendingSubmit | null => {
    return pendingSubmitRef.current;
  }, []);

  return {
    state,
    dispatch,
    setFormCache,
    getFormCache,
    setPendingSubmit,
    getPendingSubmit,
  };
}
