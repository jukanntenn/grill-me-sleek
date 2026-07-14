// App — root component: state machine + SSE + conditional rendering.
//
// Orchestrates the grilling lifecycle:
//   1. Read sessionId from URL hash
//   2. FETCH_CURRENT → RENDER_QUESTIONS
//   3. SSE listens for round.created / terminal events
//   4. Submit → WAIT_NEXT_ROUND
//   5. Reconnect on SSE/network errors
//
// Migrated from app.ts:103-112 (main) + app.ts:340-384 (render dispatch).

import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useGrillingMachine, type State } from "./hooks/useGrillingMachine";
import { useSSE } from "./hooks/useSSE";
import { useSubmit } from "./hooks/useSubmit";
import { fetchCurrent } from "./lib/api";
import { Controls } from "./components/Controls";
import { TerminalPage } from "./components/TerminalPage";
import { QuestionsPage } from "./pages/QuestionsPage";

export function App() {
  const { t } = useTranslation();
  const { state, dispatch, setFormCache, getFormCache, setPendingSubmit, getPendingSubmit } =
    useGrillingMachine();

  // Track current state in a ref for useSSE (avoids stale closures).
  const stateRef = useRef<State>(state);
  stateRef.current = state;

  const [banner, setBanner] = useState<string | null>(null);

  // Read sessionId from hash.
  const sessionId = (() => {
    const hash = window.location.hash.slice(1);
    return hash || null;
  })();

  // --- Submit handler ---
  const { submit, retry } = useSubmit({
    dispatch,
    getPendingSubmit,
    setPendingSubmit,
    onBanner: (msg) => setBanner(msg),
    t,
  });

  // --- Round created confirmation (DESIGN.md §959) ---
  const onRoundCreated = useCallback(
    async (newRound: number): Promise<boolean> => {
      return window.confirm(t("confirmSwitchRound", { n: newRound }));
    },
    [t],
  );

  // --- Reconnect round caching ---
  const onReconnectRound = useCallback(
    (round: import("./types").RoundData) => {
      // Round data is dispatched via RECONNECT_SUCCESS; no extra caching needed.
      void round;
    },
    [],
  );

  // --- SSE ---
  useSSE({
    sessionId,
    stateRef,
    dispatch,
    onRoundCreated,
    onReconnectRound,
  });

  // --- Initial fetch on mount ---
  useEffect(() => {
    if (!sessionId) {
      dispatch({ type: "BOOT_NO_SESSION", message: "invalid-link" });
      return;
    }
    dispatch({ type: "FETCH_START", sessionId });
    void (async () => {
      const result = await fetchCurrent(sessionId);
      if (result.ok) {
        dispatch({ type: "FETCH_SUCCESS", round: result.round, sessionId });
      } else if (result.kind === "not-found") {
        dispatch({ type: "FETCH_NOT_FOUND" });
      } else if (result.kind === "gone") {
        dispatch({ type: "FETCH_GONE", detail: result.detail });
      } else {
        // retry — trigger reconnect by dispatching FETCH_RETRY
        dispatch({ type: "FETCH_RETRY", sessionId, attempt: 1 });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Submit wrapper (caches form values before submit) ---
  const handleSubmit = useCallback(
    (round: import("./types").RoundData, answers: Record<string, import("./types").Answer>, additionalNotes?: string) => {
      setFormCache(round.round, answers);
      dispatch({ type: "ENTER_VALIDATE", round, sessionId: sessionId ?? "" });
      void submit(sessionId ?? "", round, answers, additionalNotes);
    },
    [setFormCache, dispatch, submit, sessionId],
  );

  // --- Retry wrapper ---
  const handleRetry = useCallback(() => {
    setBanner(null);
    void retry();
  }, [retry]);

  // --- Render ---
  return (
    <>
      <Controls />
      {renderState(state, {
        t,
        sessionId,
        getFormCache,
        banner,
        setBanner,
        onSubmit: handleSubmit,
        onRetry: handleRetry,
      })}
    </>
  );
}

interface RenderProps {
  t: (key: string, params?: Record<string, unknown>) => string;
  sessionId: string | null;
  getFormCache: (round: number) => Record<string, import("./types").Answer> | undefined;
  banner: string | null;
  setBanner: (msg: string | null) => void;
  onSubmit: (round: import("./types").RoundData, answers: Record<string, import("./types").Answer>, additionalNotes?: string) => void;
  onRetry: () => void;
}

function renderState(state: State, props: RenderProps) {
  const { t } = props;

  switch (state.type) {
    case "BOOT":
    case "FETCH_CURRENT":
      return <p className="text-center body-md text-body py-[var(--spacing-5xl)]">{t("loading")}</p>;

    case "RENDER_QUESTIONS":
    case "VALIDATE":
      return (
        <QuestionsPage
          round={state.round}
          cachedValues={props.getFormCache(state.round.round)}
          bannerMessage={props.banner}
          onBanner={props.setBanner}
          onSubmit={(answers, notes) => props.onSubmit(state.round, answers, notes)}
          onRetry={props.onRetry}
        />
      );

    case "WAIT_NEXT_ROUND":
      return <p className="text-center body-md text-body py-[var(--spacing-5xl)]">{t("waitingNextRound")}</p>;

    case "RECONNECTING":
      return <p className="text-center body-md text-body py-[var(--spacing-5xl)]">{t("reconnecting", { n: state.attempt })}</p>;

    case "PAGE_COMPLETED":
      return <TerminalPage title={t("completed")} body={t("completedBody")} />;

    case "PAGE_CANCELLED":
      return (
        <TerminalPage
          title={t("cancelled")}
          body={state.reason ? state.reason : t("errorSessionEnded")}
        />
      );

    case "PAGE_EXPIRED":
      return <TerminalPage title={t("expired")} body={t("errorSessionEnded")} />;

    case "ERROR_PAGE":
      return renderErrorPage(state.message, t);

    case "PAGE_RECONNECT_FAILED":
      return <TerminalPage title={t("connectionLost")} body={t("reconnectFailed")} />;

    default:
      return null;
  }
}

function renderErrorPage(message: string, t: (key: string) => string) {
  let title: string;
  let body: string;
  switch (message) {
    case "invalid-link":
      title = t("errorInvalidLink");
      body = "";
      break;
    case "not-found":
      title = t("errorNotFound");
      body = "";
      break;
    case "session-ended":
      title = t("connectionLost");
      body = t("errorSessionEnded");
      break;
    default:
      title = t("connectionLost");
      body = message;
  }
  return body ? (
    <TerminalPage title={title} body={body} />
  ) : (
    <TerminalPage title={title} body={title} />
  );
}
