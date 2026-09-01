// App — root component: state machine + SSE + conditional rendering.
//
// Orchestrates the grilling lifecycle:
//   1. Read sessionId from URL hash
//   2. FETCH_CURRENT → RENDER_QUESTIONS
//   3. SSE listens for round.created / response.revised / terminal events
//   4. Submit → WAIT_NEXT_ROUND
//   5. Reconnect on SSE/network errors
//   6. Round history: answered rounds are reviewable (REVIEW_ROUND) and
//      revisable (REVISE_ROUND → PUT), with the agent notified server-side
//   7. document.title = session name (tab identification across projects)

import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useGrillingMachine, type State } from "./hooks/useGrillingMachine";
import { useSSE, type SessionNotice } from "./hooks/useSSE";
import { useSubmit } from "./hooks/useSubmit";
import type { RoundData, RoundSummaryData, Answer } from "./types";
import { fetchCurrent, fetchRound, fetchRounds, fetchSession, reviseResponse } from "./lib/api";
import { sessionTitle } from "./lib/title";
import { Controls } from "./components/Controls";
import { RoundStepper } from "./components/RoundStepper";
import { TerminalPage } from "./components/TerminalPage";
import { LandingPage } from "./pages/LandingPage";
import { QuestionsPage } from "./pages/QuestionsPage";
import { ReviewRoundPage } from "./pages/ReviewRoundPage";

export function App() {
  const { t } = useTranslation();
  const { state, dispatch, setFormCache, getFormCache, setPendingSubmit, getPendingSubmit } =
    useGrillingMachine();

  // Track current state in a ref for useSSE (avoids stale closures).
  const stateRef = useRef<State>(state);
  stateRef.current = state;

  const [banner, setBanner] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rounds, setRounds] = useState<RoundSummaryData[] | null>(null);
  const [sessionName, setSessionName] = useState<string | null>(null);
  // Self-revision marker: the response.revised SSE echo of our own PUT must
  // not fight the post-revise "back to current" navigation.
  const selfRevisionRef = useRef<{ round: number; until: number } | null>(null);

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

  // --- Reconnect round caching ---
  const onReconnectRound = useCallback((round: RoundData) => {
    // Round data is dispatched via RECONNECT_SUCCESS; no extra caching needed.
    void round;
  }, []);

  // --- Round summaries (stepper) ---
  const refreshRounds = useCallback(async () => {
    if (!sessionId) return;
    const list = await fetchRounds(sessionId);
    if (list) setRounds(list);
  }, [sessionId]);

  // Refresh summaries whenever the current round changes (covers initial
  // load, round.created refetches, and reconnects).
  const currentSeq =
    state.type === "RENDER_QUESTIONS" || state.type === "VALIDATE"
      ? state.round.round
      : state.type === "WAIT_NEXT_ROUND"
        ? state.currentRound
        : null;
  useEffect(() => {
    if (sessionId && currentSeq !== null) void refreshRounds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, currentSeq]);

  // --- Session-advance notices (non-modal: the session owns what is current;
  //     the only deliberate view — history — is never yanked) ---
  const onNotice = useCallback(
    (notice: SessionNotice) => {
      if (notice.kind === "answered-elsewhere") {
        setNotice(t("answeredElsewhere", { n: notice.round }));
        void refreshRounds();
      } else if (notice.kind === "switched-round") {
        setNotice(t("switchedToNewRound", { n: notice.round }));
      } else {
        setBanner(t("newRoundWhileViewingHistory", { n: notice.round }));
        void refreshRounds();
      }
    },
    [t, refreshRounds],
  );

  // --- SSE ---
  const onResponseRevised = useCallback(
    (roundSeq: number) => {
      void refreshRounds();

      // Our own PUT echoes back as response.revised — ignore the view refresh
      // for it (the revise flow itself navigates back to the current round).
      const self = selfRevisionRef.current;
      if (self && self.round === roundSeq && Date.now() < self.until) return;

      const st = stateRef.current;
      if (!sessionId) return;
      if (st.type !== "REVIEW_ROUND" && st.type !== "REVISE_ROUND") return;
      if (st.round.round !== roundSeq) return;
      if (st.type === "REVIEW_ROUND") {
        // Viewing the revised round: reload the latest version and surface it.
        void (async () => {
          const round = await fetchRound(sessionId, roundSeq);
          if (round?.response) {
            dispatch({ type: "VIEW_ROUND", round, sessionId });
            setBanner(t("revisedElsewhere"));
          }
        })();
      } else if (st.type === "REVISE_ROUND") {
        // Editing the same round while another tab revised it: don't clobber
        // in-progress edits — warn; the server is last-writer-wins anyway.
        setBanner(t("revisedElsewhere"));
      }
    },
    [sessionId, refreshRounds, dispatch, t],
  );

  useSSE({
    sessionId,
    stateRef,
    dispatch,
    onNotice,
    onReconnectRound,
    onResponseRevised,
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

  // --- Tab title: session name (stable), falling back to the round's
  //     grilling name until the session fetch resolves (or if it fails). ---
  useEffect(() => {
    if (!sessionId) return;
    void (async () => {
      const result = await fetchSession(sessionId);
      if (result.ok && result.session.name) setSessionName(result.session.name);
    })();
  }, [sessionId]);

  const grillingName =
    state.type === "RENDER_QUESTIONS" ||
    state.type === "VALIDATE" ||
    state.type === "REVIEW_ROUND" ||
    state.type === "REVISE_ROUND"
      ? state.round.grilling.name
      : null;
  useEffect(() => {
    const name = sessionName ?? grillingName;
    if (sessionId && name) document.title = sessionTitle(name);
  }, [sessionId, sessionName, grillingName]);

  // --- Submit wrapper (caches form values before submit) ---
  const handleSubmit = useCallback(
    (round: RoundData, answers: Record<string, Answer>, additionalNotes?: string) => {
      setFormCache(round.round, answers);
      dispatch({ type: "ENTER_VALIDATE", round, sessionId: sessionId ?? "" });
      void submit(sessionId ?? "", round, answers, additionalNotes);
    },
    [setFormCache, dispatch, submit, sessionId],
  );

  // --- Round history: view / revise / back ---
  const handleBackToCurrent = useCallback(async () => {
    if (!sessionId) return;
    dispatch({ type: "FETCH_START", sessionId });
    const result = await fetchCurrent(sessionId);
    if (result.ok) {
      dispatch({ type: "FETCH_SUCCESS", round: result.round, sessionId });
    } else if (result.kind === "not-found") {
      dispatch({ type: "FETCH_NOT_FOUND" });
    } else if (result.kind === "gone") {
      dispatch({ type: "FETCH_GONE", detail: result.detail });
    } else {
      dispatch({ type: "FETCH_RETRY", sessionId, attempt: 1 });
    }
  }, [sessionId, dispatch]);

  const handleViewRound = useCallback(
    async (seq: number) => {
      if (!sessionId) return;
      const st = stateRef.current;
      // Leaving revise mode discards in-progress edits — confirm first.
      if (st.type === "REVISE_ROUND" && !window.confirm(t("confirmDiscardRevise"))) return;
      void refreshRounds();
      const round = await fetchRound(sessionId, seq);
      if (round?.response) {
        dispatch({ type: "VIEW_ROUND", round, sessionId });
      } else if (round) {
        // Unanswered round (the current one) — show its form instead.
        dispatch({ type: "FETCH_SUCCESS", round, sessionId });
      }
    },
    [sessionId, dispatch, t, refreshRounds],
  );

  const handleRevise = useCallback(
    async (round: RoundData, answers: Record<string, Answer>, additionalNotes?: string) => {
      if (!sessionId) return;
      setFormCache(round.round, answers);
      // Mark this revision as self-initiated so its SSE echo doesn't fight
      // the back-to-current navigation below.
      selfRevisionRef.current = { round: round.round, until: Date.now() + 5000 };
      const result = await reviseResponse(sessionId, round.round, answers, additionalNotes);
      if (result.ok) {
        setNotice(t("revisedNotice", { n: round.round }));
        void refreshRounds();
        await handleBackToCurrent();
      } else if (result.kind === "not-answered") {
        setBanner(t("bannerRoundNotAnswered"));
      } else if (result.kind === "gone") {
        dispatch({ type: "FETCH_GONE", detail: result.detail });
      } else if (result.kind === "bad-request") {
        setBanner(t("bannerServerError", { n: 400 }) + ` ${result.message}`);
      } else if (result.kind === "server-error") {
        setBanner(t("bannerServerError", { n: result.status }));
      } else {
        setBanner(t("bannerNetworkError"));
      }
    },
    [sessionId, setFormCache, refreshRounds, handleBackToCurrent, dispatch, t],
  );

  // --- Retry wrapper ---
  const handleRetry = useCallback(() => {
    setBanner(null);
    void retry();
  }, [retry]);

  // --- Render ---
  // No session id in the URL hash → plain visit: show the landing page.
  // All hooks above already ran; they are no-ops without a session id.
  if (!sessionId) {
    return <LandingPage />;
  }

  const stepperVisible =
    state.type === "RENDER_QUESTIONS" ||
    state.type === "VALIDATE" ||
    state.type === "WAIT_NEXT_ROUND" ||
    state.type === "REVIEW_ROUND" ||
    state.type === "REVISE_ROUND";
  const currentRoundFromList = rounds && rounds.length > 0 ? rounds[rounds.length - 1].round : null;
  const activeRound =
    state.type === "RENDER_QUESTIONS" ||
    state.type === "VALIDATE" ||
    state.type === "REVIEW_ROUND" ||
    state.type === "REVISE_ROUND"
      ? state.round.round
      : state.type === "WAIT_NEXT_ROUND"
        ? state.currentRound
        : null;

  return (
    <div className="session-shell">
      <Controls />
      {stepperVisible && rounds && currentRoundFromList !== null && (
        <RoundStepper
          rounds={rounds}
          currentRound={currentRoundFromList}
          activeRound={activeRound ?? currentRoundFromList}
          onSelect={(n) => void handleViewRound(n)}
        />
      )}
      {notice && (
        <div
          role="status"
          data-testid="notice"
          className="border-primary bg-canvas-soft text-primary mb-[var(--spacing-md)] rounded-[var(--radius-md)] border px-[var(--spacing-md)] py-[var(--spacing-sm)] text-sm"
        >
          {notice}
        </div>
      )}
      {renderState(state, {
        t,
        sessionId,
        getFormCache,
        banner,
        setBanner,
        onSubmit: handleSubmit,
        onRetry: handleRetry,
        onRevise: (round, answers, notes) => void handleRevise(round, answers, notes),
        onEnterRevise: () => dispatch({ type: "ENTER_REVISE" }),
        onBackToCurrent: () => void handleBackToCurrent(),
      })}
    </div>
  );
}

interface RenderProps {
  t: (key: string, params?: Record<string, unknown>) => string;
  sessionId: string | null;
  getFormCache: (round: number) => Record<string, Answer> | undefined;
  banner: string | null;
  setBanner: (msg: string | null) => void;
  onSubmit: (round: RoundData, answers: Record<string, Answer>, additionalNotes?: string) => void;
  onRetry: () => void;
  onRevise: (round: RoundData, answers: Record<string, Answer>, additionalNotes?: string) => void;
  onEnterRevise: () => void;
  onBackToCurrent: () => void;
}

function renderState(state: State, props: RenderProps) {
  const { t } = props;

  switch (state.type) {
    case "BOOT":
    case "FETCH_CURRENT":
      return (
        <p className="body-md text-body py-[var(--spacing-5xl)] text-center">{t("loading")}</p>
      );

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
      return (
        <div className="py-[var(--spacing-5xl)] text-center">
          <p className="body-md text-body">{t("waitingNextRound")}</p>
          <p className="text-mute mt-[var(--spacing-sm)] text-sm">{t("roundHistoryHint")}</p>
        </div>
      );

    case "REVIEW_ROUND":
      return (
        <ReviewRoundPage
          round={state.round}
          onRevise={props.onEnterRevise}
          onBack={props.onBackToCurrent}
        />
      );

    case "REVISE_ROUND":
      return (
        <QuestionsPage
          round={state.round}
          cachedValues={state.round.response?.answers}
          cachedNotes={state.round.response?.additional_notes}
          mode="revise"
          bannerMessage={props.banner}
          onBanner={props.setBanner}
          onSubmit={(answers, notes) => props.onRevise(state.round, answers, notes)}
          onRetry={props.onRetry}
        />
      );

    case "RECONNECTING":
      return (
        <p className="body-md text-body py-[var(--spacing-5xl)] text-center">
          {t("reconnecting", { n: state.attempt })}
        </p>
      );

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
