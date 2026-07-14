// SSE hook — EventSource lifecycle + exponential-backoff reconnect.
//
// Migrated from app.ts:201-293. Key design (DESIGN.md §808-818, §949-963):
//   - 5 event types → dispatch actions
//   - on error: close + schedule reconnect (exponential backoff 1/2/4/8/16s, cap 30s)
//   - reconnect success MUST re-GET current (compensate missed events — no Last-Event-ID)
//   - after 5 min of failure → PAGE_RECONNECT_FAILED
//   - useRef holds EventSource + timer to avoid stale closures
//
// The hook takes the current state via a ref so it can decide whether to
// reconnect (skip if terminal).

import { useEffect, useRef } from "react";
import type { Dispatch } from "react";
import { fetchCurrent, sseUrl } from "../lib/api";
import type { Action, State } from "./useGrillingMachine";
import { isTerminal } from "./useGrillingMachine";

const BACKOFF_CAP_SEC = 30;
const RECONNECT_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

interface UseSSEParams {
  sessionId: string | null;
  stateRef: React.MutableRefObject<State>;
  dispatch: Dispatch<Action>;
  /** Called when SSE round.created fires while user is mid-round (RENDER_QUESTIONS).
   *  Returns true if the round switch was confirmed. */
  onRoundCreated?: (newRound: number) => Promise<boolean>;
  /** Called when reconnect succeeds — allows re-caching the round. */
  onReconnectRound?: (round: import("../types").RoundData) => void;
}

export function useSSE({
  sessionId,
  stateRef,
  dispatch,
  onRoundCreated,
  onReconnectRound,
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
        if (st.type === "RENDER_QUESTIONS") {
          // Confirm with user before switching (DESIGN.md §959).
          const confirmed = onRoundCreated
            ? await onRoundCreated(newRound)
            : true;
          if (confirmed) {
            dispatch({ type: "FETCH_START", sessionId: sid });
            const result = await fetchCurrent(sid);
            if (result.ok) {
              dispatch({ type: "FETCH_SUCCESS", round: result.round, sessionId: sid });
              connect(sid);
            }
          }
          // If not confirmed, stay in RENDER_QUESTIONS (current answers preserved).
        } else if (st.type === "WAIT_NEXT_ROUND") {
          dispatch({ type: "FETCH_START", sessionId: sid });
          const result = await fetchCurrent(sid);
          if (result.ok) {
            dispatch({ type: "FETCH_SUCCESS", round: result.round, sessionId: sid });
          }
        }
      });

      es.addEventListener("response.created", () => {
        // Client-only ack; the agent receives the answer via long-poll.
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
