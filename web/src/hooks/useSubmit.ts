// Submit hook — POST /response with result handling.
//
// Migrated from app.ts:158-195 (submitResponse) + app.ts:834-858 (handleSubmit).
// Handles: 201 (success) → WAIT_NEXT_ROUND, 409 (conflict) → WAIT_NEXT_ROUND,
// 400 (bad request) → banner, 410 (gone) → terminal, 5xx/network → banner+retry.
//
// pendingSubmit is stored in a ref (via useGrillingMachine) so the retry
// button resubmits the same payload (DESIGN.md §971).

import { useCallback } from "react";
import type { Dispatch } from "react";
import { submitResponse, type SubmitResult } from "../lib/api";
import type { Action } from "./useGrillingMachine";
import type { RoundData, Answer } from "../types";

interface UseSubmitParams {
  dispatch: Dispatch<Action>;
  getPendingSubmit: () => import("./useGrillingMachine").PendingSubmit | null;
  setPendingSubmit: (p: import("./useGrillingMachine").PendingSubmit | null) => void;
  /** Called when a banner message should be shown (error/retry). */
  onBanner: (message: string) => void;
  /** i18n banner message resolver. */
  t: (key: string, params?: Record<string, unknown>) => string;
}

export function useSubmit({
  dispatch,
  getPendingSubmit,
  setPendingSubmit,
  onBanner,
  t,
}: UseSubmitParams) {
  /** Shared result handler — used by both submit() and retry(). */
  const handleResult = useCallback(
    (result: SubmitResult, sessionId: string, roundNum: number) => {
      if (result.ok) {
        setPendingSubmit(null);
        dispatch({ type: "SUBMIT_SUCCESS", sessionId, currentRound: roundNum });
        return;
      }
      switch (result.kind) {
        case "conflict":
          // 409 — already submitted, enter waiting (DESIGN.md §1369-1388).
          setPendingSubmit(null);
          dispatch({ type: "SUBMIT_CONFLICT", sessionId, currentRound: roundNum });
          break;
        case "gone":
          dispatch({ type: "FETCH_GONE", detail: result.detail });
          break;
        case "bad-request":
          onBanner(t("bannerServerError", { n: 400 }) + ` ${result.message}`);
          break;
        case "server-error":
          onBanner(t("bannerServerError", { n: result.status }));
          break;
        case "network-error":
          onBanner(t("bannerNetworkError"));
          break;
      }
    },
    [dispatch, setPendingSubmit, onBanner, t],
  );

  /** Submit form values. Stores pendingSubmit for retry. */
  const submit = useCallback(
    async (
      sessionId: string,
      round: RoundData,
      answers: Record<string, Answer>,
      additionalNotes?: string,
    ) => {
      setPendingSubmit({ sessionId, round: round.round, answers, additionalNotes });
      const result = await submitResponse(sessionId, round.round, answers, additionalNotes);
      handleResult(result, sessionId, round.round);
    },
    [setPendingSubmit, handleResult],
  );

  /** Retry the last pending submission (or no-op if none). */
  const retry = useCallback(async () => {
    const pending = getPendingSubmit();
    if (!pending) return;
    const result = await submitResponse(
      pending.sessionId,
      pending.round,
      pending.answers,
      pending.additionalNotes,
    );
    handleResult(result, pending.sessionId, pending.round);
  }, [getPendingSubmit, handleResult]);

  return { submit, retry };
}
