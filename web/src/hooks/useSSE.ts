// SSE hook — EventSource lifecycle + exponential-backoff reconnect.
//
// Key design:
//   - Event types → dispatch actions (terminal events) or fetch-and-route
//     (round lifecycle: the session, not this page, owns what is current)
//   - on error: close + schedule reconnect (exponential backoff 1/2/4/8/16s, cap 30s)
//   - reconnect success MUST re-GET current (compensate missed events — no Last-Event-ID)
//   - after 5 min of failure → PAGE_RECONNECT_FAILED
//   - useRef holds EventSource + timer to avoid stale closures
//
// Answers may land from anywhere — this page, an agent-side proxy for another
// answer surface, another tab. `response.created` arriving while a form is
// still showing therefore syncs to the session's current state (an answered
// round renders no form), and a `round.created` switches along without a
// modal: the only human deliberation left is viewing history, which is never
// yanked. The hook takes the current state via a ref so it can decide.

import { useEffect, useRef } from "react";
import type { Dispatch } from "react";
import { fetchCurrent, sseUrl } from "../lib/api";
import type { Action, State } from "./useGrillingMachine";
import { isTerminal } from "./useGrillingMachine";

const BACKOFF_CAP_SEC = 30;
const RECONNECT_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

/** Non-modal notices the session's advance raises for the UI layer. */
export type SessionNotice =
  | { kind: "answered-elsewhere"; round: number }
  | { kind: "switched-round"; round: number }
  | { kind: "new-round-history"; round: number };

interface UseSSEParams {
  sessionId: string | null;
  stateRef: React.MutableRefObject<State>;
  dispatch: Dispatch<Action>;
  /** Non-modal notices: answered elsewhere, auto-switched to a new round, new round while viewing history. */
  onNotice?: (notice: SessionNotice) => void;
  /** Called when reconnect succeeds — allows re-caching the round. */
  onReconnectRound?: (round: import("../types").RoundData) => void;
  /** Called when a response.revised event arrives (revision landed on `round`). */
  onResponseRevised?: (round: number, revision: number) => void;
}

export function useSSE({
  sessionId,
  stateRef,
  dispatch,
  onNotice,
  onReconnectRound,
  onResponseRevised,
}: UseSSEParams) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectSinceRef = useRef<number>(0);

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    // --- Reconnect with exponential backoff (DESIGN.md §808-818) ---------
    async function reconnect(sid: string, attempt: number) {
      const st = stateRef.current;
      if (isTerminal(st)) return;

      // Check 5-min timeout
      if (reconnectSinceRef.current === 0) {
        reconnectSinceRef.current = Date.now();
      }
      if (Date.now() - reconnectSinceRef.current > RECONNECT_TIMEOUT_MS) {
        dispatch({ type: "RECONNECT_FAILED" });
        reconnectSinceRef.current = 0;
        return;
      }

      dispatch({ type: "FETCH_RETRY", sessionId: sid, attempt });

      const delay = Math.min(Math.pow(2, attempt - 1), BACKOFF_CAP_SEC) * 1000;
      reconnectTimerRef.current = window.setTimeout(async () => {
        if (cancelled) return;
        // DESIGN.md §814 — reconnect MUST GET current to confirm state.
        const result = await fetchCurrent(sid);
        if (cancelled) return;
        if (result.ok) {
          reconnectSinceRef.current = 0;
          onReconnectRound?.(result.round);
          dispatch({ type: "RECONNECT_SUCCESS", round: result.round, sessionId: sid });
          connect(sid);
        } else if (result.kind === "gone") {
          dispatch({ type: "FETCH_GONE", detail: result.detail });
        } else if (result.kind === "not-found") {
          dispatch({ type: "FETCH_NOT_FOUND" });
        } else {
          reconnect(sid, attempt + 1);
        }
      }, delay);
    }

    // --- Connect EventSource ---------------------------------------------
    function connect(sid: string) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      const es = new EventSource(sseUrl(sid));
      eventSourceRef.current = es;

      es.addEventListener("round.created", async (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        const newRound = data.round as number;
        const st = stateRef.current;
        // Viewing history is deliberate: never yank. The stepper carries the
        // user to the new round when they choose; only raise a notice.
        if (st.type === "REVIEW_ROUND" || st.type === "REVISE_ROUND") {
          onNotice?.({ kind: "new-round-history", round: newRound });
          return;
        }
        if (isTerminal(st)) return;
        const wasOnForm = st.type === "RENDER_QUESTIONS" || st.type === "VALIDATE";
        const result = await fetchCurrent(sid);
        if (result.ok) {
          dispatch({ type: "FETCH_SUCCESS", round: result.round, sessionId: sid });
          if (wasOnForm) onNotice?.({ kind: "switched-round", round: newRound });
        }
        // A failed fetch falls through to the reconnect ladder via onerror.
      });

      es.addEventListener("response.created", (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        const st = stateRef.current;
        // An answer landed while a form is still showing: this page did not
        // submit (own submits pass through VALIDATE), so the round was
        // answered on another surface — or, in VALIDATE, the submit's own
        // ack raced the POST. Either way the form is dead: sync to current.
        if (st.type === "RENDER_QUESTIONS" || st.type === "VALIDATE") {
          void fetchCurrent(sid).then((result) => {
            if (result.ok) {
              dispatch({ type: "FETCH_SUCCESS", round: result.round, sessionId: sid });
            }
          });
          if (st.type === "RENDER_QUESTIONS") {
            onNotice?.({ kind: "answered-elsewhere", round: data.round as number });
          }
        } else if (st.type === "REVIEW_ROUND" || st.type === "REVISE_ROUND") {
          // A newer round got answered while viewing history: informational only.
          onNotice?.({ kind: "answered-elsewhere", round: data.round as number });
        }
        // WAIT_NEXT_ROUND is the own-submit ack; other states converge on
        // their next fetch.
      });

      es.addEventListener("response.revised", (e: MessageEvent) => {
        // A revision landed — typically from another tab. The agent is
        // notified via long-poll/SSE independently; here we only refresh
        // what the user is looking at.
        const data = JSON.parse(e.data);
        onResponseRevised?.(data.round as number, data.revision as number);
      });

      es.addEventListener("session.completed", () => {
        dispatch({ type: "SSE_COMPLETED" });
        closeSSE();
      });

      es.addEventListener("session.cancelled", (e: MessageEvent) => {
        const data = JSON.parse(e.data);
        dispatch({ type: "SSE_CANCELLED", reason: data.reason });
        closeSSE();
      });

      es.addEventListener("session.expired", () => {
        dispatch({ type: "SSE_EXPIRED" });
        closeSSE();
      });

      es.onerror = () => {
        closeSSE();
        const st = stateRef.current;
        // DESIGN.md §810-818 — on SSE error, fall back to GET current (reconnect)
        // unless terminal.
        if (!isTerminal(st)) {
          reconnect(sid, 1);
        }
      };
    }

    function closeSSE() {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }

    connect(sessionId);

    return () => {
      cancelled = true;
      closeSSE();
      reconnectSinceRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);
}
