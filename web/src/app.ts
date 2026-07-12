import "./styles.css";
import { t, setLocale, getLocale, SUPPORTED_LOCALES, type Locale } from "./i18n";
import { initTheme, setTheme, getTheme, SUPPORTED_THEMES, type Theme } from "./theme";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OptionItem {
  label: string;
  description?: string;
}

interface Question {
  id: string;
  header: string;
  text: string;
  type: "single" | "multi" | "text";
  options?: OptionItem[];
  recommended?: number;
  variant?: "default" | "yesno" | "rating";
  rating_max?: number;
  placeholder?: string;
  max_length?: number;
  required?: boolean;
  allow_custom_text?: boolean;
  explanation?: string;
}

interface AdditionalNotes {
  label?: string;
  placeholder?: string;
  max_length?: number;
  required?: boolean;
}

interface Grilling {
  name: string;
  description?: string;
  additional_notes?: AdditionalNotes;
  questions: Question[];
}

interface Answer {
  selected: string | string[];
  custom_text?: string;
}

interface ResponseData {
  round: number;
  answers: Record<string, Answer>;
  additional_notes?: string;
  submitted_at: string;
}

interface RoundData {
  round: number;
  name?: string;
  grilling: Grilling;
  response: ResponseData | null;
}

// ---------------------------------------------------------------------------
// State machine — DESIGN.md §902-973 (all states + transitions)
// ---------------------------------------------------------------------------

type State =
  | { type: "BOOT" }
  | { type: "FETCH_CURRENT"; sessionId: string }
  | { type: "RENDER_QUESTIONS"; round: RoundData; sessionId: string }
  | { type: "VALIDATE"; round: RoundData; sessionId: string }
  | { type: "WAIT_NEXT_ROUND"; sessionId: string; currentRound: number }
  | { type: "RECONNECTING"; sessionId: string; attempt: number; since: number }
  | { type: "PAGE_COMPLETED" }
  | { type: "PAGE_CANCELLED"; reason?: string }
  | { type: "PAGE_EXPIRED" }
  | { type: "ERROR_PAGE"; message: string }
  | { type: "PAGE_RECONNECT_FAILED" };

let currentState: State = { type: "BOOT" };
let eventSource: EventSource | null = null;
let reconnectTimer: number | null = null;

// Form values cache: round seq -> form values (so switching/preserving round
// data survives round.created prompts and failed submits — DESIGN.md §959/§971).
const formCache = new Map<number, Record<string, Answer>>();

// Pending submission, kept across failed POSTs so the retry button resubmits
// the same data instead of reloading the round (DESIGN.md §971).
let pendingSubmit: {
  sessionId: string;
  round: number;
  answers: Record<string, Answer>;
  additionalNotes?: string;
} | null = null;

const API = "/v1";

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

function main() {
  initTheme();
  const hash = window.location.hash.slice(1);
  if (!hash) {
    transition({ type: "ERROR_PAGE", message: t("errorInvalidLink") });
    return;
  }
  transition({ type: "FETCH_CURRENT", sessionId: hash });
  fetchCurrent(hash);
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

function transition(state: State) {
  currentState = state;
  render(state);
}

function isTerminal(s: State): boolean {
  return (
    s.type === "PAGE_COMPLETED" ||
    s.type === "PAGE_CANCELLED" ||
    s.type === "PAGE_EXPIRED" ||
    s.type === "ERROR_PAGE" ||
    s.type === "PAGE_RECONNECT_FAILED"
  );
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

async function fetchCurrent(sessionId: string) {
  transition({ type: "FETCH_CURRENT", sessionId });
  try {
    const resp = await fetch(`${API}/sessions/${sessionId}/rounds/current`);
    if (resp.ok) {
      const round: RoundData = await resp.json();
      transition({ type: "RENDER_QUESTIONS", round, sessionId });
      connectSSE(sessionId);
    } else if (resp.status === 410) {
      const body = await resp.json();
      handleGone(body.detail);
    } else if (resp.status === 404) {
      transition({ type: "ERROR_PAGE", message: t("errorNotFound") });
    } else {
      scheduleReconnect(sessionId, 1);
    }
  } catch {
    scheduleReconnect(sessionId, 1);
  }
}

async function submitResponse(
  sessionId: string,
  round: number,
  answers: Record<string, Answer>,
  additionalNotes?: string,
) {
  pendingSubmit = { sessionId, round, answers, additionalNotes };
  try {
    const body: Record<string, unknown> = { answers };
    if (additionalNotes !== undefined) body.additional_notes = additionalNotes;
    const resp = await fetch(`${API}/sessions/${sessionId}/rounds/${round}/response`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (resp.status === 201) {
      pendingSubmit = null;
      transition({ type: "WAIT_NEXT_ROUND", sessionId, currentRound: round });
    } else if (resp.status === 409) {
      // DESIGN.md §1369-1388 — read the 409 body's response and treat it as
      // the submitted result (don't resubmit). Entering WAIT_NEXT_ROUND.
      pendingSubmit = null;
      transition({ type: "WAIT_NEXT_ROUND", sessionId, currentRound: round });
    } else if (resp.status === 400) {
      const err = await resp.json().catch(() => ({}));
      showBanner(t("bannerServerError").replace("{n}", "400") + ` ${err.message ?? ""}`);
    } else if (resp.status === 410) {
      const body = await resp.json();
      handleGone(body.detail);
    } else {
      // 5xx / network — keep the form, show retry (DESIGN.md §971).
      showBanner(resp.status > 0 ? t("bannerServerError", { n: resp.status }) : t("bannerNetworkError"));
    }
  } catch {
    showBanner(t("bannerNetworkError"));
  }
}

// ---------------------------------------------------------------------------
// SSE
// ---------------------------------------------------------------------------

function connectSSE(sessionId: string) {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  eventSource = new EventSource(`${API}/sessions/${sessionId}/events`);

  eventSource.addEventListener("round.created", (e) => {
    const data = JSON.parse(e.data);
    handleRoundCreated(sessionId, data.round);
  });

  eventSource.addEventListener("response.created", () => {
    // Client-only ack; agent receives the answer via long-poll.
  });

  eventSource.addEventListener("session.completed", () => {
    transition({ type: "PAGE_COMPLETED" });
    closeSSE();
  });

  eventSource.addEventListener("session.cancelled", (e) => {
    const data = JSON.parse(e.data);
    transition({ type: "PAGE_CANCELLED", reason: data.reason });
    closeSSE();
  });

  eventSource.addEventListener("session.expired", () => {
    transition({ type: "PAGE_EXPIRED" });
    closeSSE();
  });

  eventSource.onerror = () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    const sid = getSessionId();
    // DESIGN.md §810-818 — on SSE error, fall back to GET current (reconnect)
    // unless we're already terminal.
    if (sid && !isTerminal(currentState)) {
      scheduleReconnect(sid, 1);
    }
  };
}

function closeSSE() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Reconnect — DESIGN.md §810-818 (exponential backoff 1/2/4/8/16, cap 30s;
// after 5 min of failure → PAGE_RECONNECT_FAILED)
// ---------------------------------------------------------------------------

function scheduleReconnect(sessionId: string, attempt: number) {
  const since = currentState.type === "RECONNECTING" ? currentState.since : Date.now();
  if (Date.now() - since > 5 * 60 * 1000) {
    transition({ type: "PAGE_RECONNECT_FAILED" });
    return;
  }
  transition({ type: "RECONNECTING", sessionId, attempt, since });

  const delay = Math.min(Math.pow(2, attempt - 1), 30) * 1000;
  reconnectTimer = window.setTimeout(async () => {
    // DESIGN.md §814/§937 — reconnect success MUST re-GET current to confirm
    // state (compensate for missed events), so we route through fetchCurrent.
    try {
      const resp = await fetch(`${API}/sessions/${sessionId}/rounds/current`);
      if (resp.ok) {
        const round: RoundData = await resp.json();
        transition({ type: "RENDER_QUESTIONS", round, sessionId });
        connectSSE(sessionId);
      } else if (resp.status === 410) {
        const body = await resp.json();
        handleGone(body.detail);
      } else if (resp.status === 404) {
        transition({ type: "ERROR_PAGE", message: t("errorNotFound") });
      } else {
        scheduleReconnect(sessionId, attempt + 1);
      }
    } catch {
      scheduleReconnect(sessionId, attempt + 1);
    }
  }, delay);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSessionId(): string | null {
  return window.location.hash.slice(1) || null;
}

function handleGone(detail: string) {
  switch (detail) {
    case "completed":
      transition({ type: "PAGE_COMPLETED" });
      break;
    case "cancelled":
      transition({ type: "PAGE_CANCELLED" });
      break;
    case "expired":
      transition({ type: "PAGE_EXPIRED" });
      break;
    default:
      transition({ type: "ERROR_PAGE", message: t("errorSessionEnded") });
  }
}

async function handleRoundCreated(sessionId: string, newRound: number) {
  const st = currentState;
  if (st.type === "RENDER_QUESTIONS") {
    // Cache current unsaved form values keyed by round seq (DESIGN.md §959).
    const formVals = collectFormValues(st.round.grilling.questions);
    formCache.set(st.round.round, formVals);

    const ok = confirm(t("confirmSwitchRound", { n: newRound }));
    if (ok) {
      await fetchCurrent(sessionId);
    }
    // If cancelled, stay in RENDER_QUESTIONS (current answers preserved).
  } else if (st.type === "WAIT_NEXT_ROUND") {
    await fetchCurrent(sessionId);
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render(state: State) {
  const app = document.getElementById("app");
  if (!app) return;
  // DESIGN.md §1010 — never use innerHTML; clear via replaceChildren.
  app.replaceChildren();
  renderControls(app);

  switch (state.type) {
    case "BOOT":
    case "FETCH_CURRENT":
      renderText(app, t("loading"));
      break;
    case "RENDER_QUESTIONS":
      renderQuestions(app, state.round, state.sessionId);
      break;
    case "VALIDATE":
      renderQuestions(app, state.round, state.sessionId);
      break;
    case "WAIT_NEXT_ROUND":
      renderText(app, t("waitingNextRound"));
      break;
    case "RECONNECTING":
      renderText(app, t("reconnecting", { n: state.attempt }));
      break;
    case "PAGE_COMPLETED":
      renderTerminal(app, t("completed"), t("completedBody"));
      break;
    case "PAGE_CANCELLED":
      renderTerminal(
        app,
        t("cancelled"),
        state.reason ? `${state.reason}` : t("errorSessionEnded"),
      );
      break;
    case "PAGE_EXPIRED":
      renderTerminal(app, t("expired"), t("errorSessionEnded"));
      break;
    case "ERROR_PAGE":
      renderTerminal(app, t("connectionLost"), state.message);
      break;
    case "PAGE_RECONNECT_FAILED":
      renderTerminal(app, t("connectionLost"), t("reconnectFailed"));
      break;
  }
}

/** Theme + language switcher, rendered in a top-right control bar. */
function renderControls(app: HTMLElement) {
  const bar = document.createElement("div");
  bar.className = "controls-bar";

  // Theme select
  const themeSel = document.createElement("select");
  themeSel.className = "ctrl-select";
  themeSel.setAttribute("aria-label", "theme");
  for (const th of SUPPORTED_THEMES) {
    const o = document.createElement("option");
    o.value = th;
    o.textContent = t(("theme" + th.charAt(0).toUpperCase() + th.slice(1)) as any);
    themeSel.appendChild(o);
  }
  themeSel.value = getTheme();
  themeSel.addEventListener("change", () => {
    setTheme(themeSel.value as Theme);
    rerender();
  });
  bar.appendChild(themeSel);

  // Language select
  const langSel = document.createElement("select");
  langSel.className = "ctrl-select";
  langSel.setAttribute("aria-label", t("languageLabel"));
  for (const loc of SUPPORTED_LOCALES) {
    const o = document.createElement("option");
    o.value = loc;
    o.textContent = loc;
    langSel.appendChild(o);
  }
  langSel.value = getLocale();
  langSel.addEventListener("change", () => {
    setLocale(langSel.value as Locale);
    rerender();
  });
  bar.appendChild(langSel);

  app.appendChild(bar);
}

function rerender() {
  render(currentState);
}

function renderText(parent: HTMLElement, text: string) {
  const p = document.createElement("p");
  p.className = "status-text";
  p.textContent = text;
  parent.appendChild(p);
}

function renderTerminal(parent: HTMLElement, title: string, body: string) {
  const card = document.createElement("div");
  card.className = "terminal-card";
  const h = document.createElement("h1");
  h.textContent = title;
  card.appendChild(h);
  const p = document.createElement("p");
  p.textContent = body;
  card.appendChild(p);
  parent.appendChild(card);
}

// ---------------------------------------------------------------------------
// Questions rendering
// ---------------------------------------------------------------------------

function renderQuestions(parent: HTMLElement, round: RoundData, sessionId: string) {
  const grilling = round.grilling;

  if (grilling.name) {
    const h = document.createElement("h1");
    h.textContent = grilling.name;
    parent.appendChild(h);
  }
  if (grilling.description) {
    const p = document.createElement("p");
    p.className = "description";
    p.textContent = grilling.description;
    parent.appendChild(p);
  }

  const banner = document.createElement("div");
  banner.id = "banner";
  banner.className = "banner hidden";
  parent.appendChild(banner);

  const form = document.createElement("form");
  form.id = "grilling-form";
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    // DESIGN.md §923 — transition through VALIDATE before submitting.
    handleSubmit(sessionId, round, grilling.questions);
  });

  const cached = formCache.get(round.round) || {};
  for (const q of grilling.questions) {
    form.appendChild(renderQuestion(q, cached[q.id]));
  }

  if (grilling.additional_notes) {
    form.appendChild(renderAdditionalNotes(grilling.additional_notes));
  }

  const submitRow = document.createElement("div");
  submitRow.className = "submit-row";
  const btn = document.createElement("button");
  btn.type = "submit";
  btn.textContent = t("submit");
  btn.className = "btn-pill btn-submit";
  submitRow.appendChild(btn);
  form.appendChild(submitRow);

  parent.appendChild(form);
}

function renderQuestion(q: Question, cached?: Answer): HTMLElement {
  const section = document.createElement("div");
  section.className = "question";
  section.dataset.qid = q.id;

  const header = document.createElement("label");
  header.className = "question-header";
  header.textContent = q.header;
  if (q.required !== false) {
    const req = document.createElement("span");
    req.className = "required";
    req.textContent = " *";
    header.appendChild(req);
  }
  section.appendChild(header);

  if (q.text) {
    const text = document.createElement("p");
    text.className = "question-text";
    text.textContent = q.text;
    section.appendChild(text);
  }

  // DESIGN.md §1562-1567 — recommended + explanation are rendered per-option
  // (next to the recommended mark), handled inside renderControl. For
  // yesno/rating (no options array) the mark is applied to the button itself.

  const error = document.createElement("div");
  error.className = "field-error hidden";
  error.id = `error-${q.id}`;
  section.appendChild(error);

  section.appendChild(renderControl(q, cached));
  return section;
}

function renderControl(q: Question, cached?: Answer): HTMLElement {
  switch (q.type) {
    case "single":
      return renderSingle(q, cached);
    case "multi":
      return renderMulti(q, cached);
    case "text":
      return renderTextControl(q, cached);
  }
}

function renderSingle(q: Question, cached?: Answer): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "control";

  if (q.variant === "yesno") {
    for (const val of ["yes", "no"]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-pill btn-option";
      btn.textContent = val === "yes" ? t("yes") : t("no");
      btn.dataset.value = val;
      if (cached?.selected === val) btn.classList.add("selected");
      // DESIGN.md §1567 — yesno recommended is boolean (1=yes, 0=no).
      if (q.recommended === 1 && val === "yes") appendRecommended(btn, q);
      else if (q.recommended === 0 && val === "no") appendRecommended(btn, q);
      btn.addEventListener("click", () => {
        wrapper.querySelectorAll(".btn-option").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
      });
      wrapper.appendChild(btn);
    }
  } else if (q.variant === "rating") {
    const max = q.rating_max || 5;
    for (let i = 1; i <= max; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-pill btn-option btn-rating";
      btn.textContent = String(i);
      btn.dataset.value = String(i);
      if (cached?.selected === String(i)) btn.classList.add("selected");
      // DESIGN.md §1566 — rating recommended = recommended rating value.
      if (q.recommended === i) appendRecommended(btn, q);
      btn.addEventListener("click", () => {
        wrapper.querySelectorAll(".btn-option").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
      });
      wrapper.appendChild(btn);
    }
  } else {
    const options = q.options ?? [];
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const label = document.createElement("label");
      label.className = "option-label";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `q_${q.id}`;
      radio.value = opt.label;
      if (cached?.selected === opt.label) radio.checked = true;
      const span = document.createElement("span");
      span.textContent = opt.label;
      // DESIGN.md §1562 — recommended mark + explanation inline at the option.
      if (q.recommended === i) {
        appendRecommended(span, q);
      }
      label.appendChild(radio);
      label.appendChild(span);
      wrapper.appendChild(label);
    }
  }

  if (q.allow_custom_text !== false) {
    wrapper.appendChild(renderCustomText(cached));
  }
  return wrapper;
}

function renderMulti(q: Question, cached?: Answer): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "control";
  const selectedSet = new Set(Array.isArray(cached?.selected) ? cached.selected : []);
  const options = q.options ?? [];
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const label = document.createElement("label");
    label.className = "option-label";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.name = `q_${q.id}`;
    cb.value = opt.label;
    if (selectedSet.has(opt.label)) cb.checked = true;
    const span = document.createElement("span");
    span.textContent = opt.label;
    if (q.recommended === i) appendRecommended(span, q);
    label.appendChild(cb);
    label.appendChild(span);
    wrapper.appendChild(label);
  }
  if (q.allow_custom_text !== false) {
    wrapper.appendChild(renderCustomText(cached));
  }
  return wrapper;
}

function renderTextControl(q: Question, cached?: Answer): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "control";
  const ta = document.createElement("textarea");
  ta.className = "text-input";
  ta.dataset.field = "selected";
  ta.placeholder = q.placeholder || "";
  if (q.max_length) ta.maxLength = q.max_length;
  if (cached?.selected && typeof cached.selected === "string") ta.value = cached.selected;
  wrapper.appendChild(ta);
  // DESIGN.md §990 — custom_text is for single/multi; a text question is
  // itself free-text, so don't render a redundant custom_text input.
  return wrapper;
}

/** Append a "Recommended" mark + explanation as inline small text. */
function appendRecommended(host: HTMLElement, q: Question) {
  const badge = document.createElement("span");
  badge.className = "recommended-inline";
  badge.textContent = ` (${t("recommended")})`;
  host.appendChild(badge);
  if (q.explanation) {
    const expl = document.createElement("span");
    expl.className = "explanation";
    expl.textContent = ` — ${q.explanation}`;
    host.appendChild(expl);
  }
}

function renderCustomText(cached?: Answer): HTMLElement {
  const ct = document.createElement("input");
  ct.type = "text";
  ct.className = "custom-text";
  ct.placeholder = t("customTextPlaceholder");
  ct.dataset.field = "custom_text";
  if (cached?.custom_text) ct.value = cached.custom_text;
  return ct;
}

function renderAdditionalNotes(config: AdditionalNotes): HTMLElement {
  const section = document.createElement("div");
  section.className = "question additional-notes";
  const header = document.createElement("label");
  header.className = "question-header";
  header.textContent = config.label || t("additionalNotesDefault");
  if (config.required) {
    const req = document.createElement("span");
    req.className = "required";
    req.textContent = " *";
    header.appendChild(req);
  }
  section.appendChild(header);
  const error = document.createElement("div");
  error.className = "field-error hidden";
  error.id = "error-additional_notes";
  section.appendChild(error);
  const ta = document.createElement("textarea");
  ta.className = "text-input";
  ta.id = "additional_notes";
  ta.placeholder = config.placeholder || t("additionalNotesDefault");
  if (config.max_length) ta.maxLength = config.max_length;
  section.appendChild(ta);
  return section;
}

// ---------------------------------------------------------------------------
// Validation — DESIGN.md §978-999 (per-field, non-blocking, inline errors)
// ---------------------------------------------------------------------------

function validate(questions: Question[], additionalNotes?: AdditionalNotes): boolean {
  let valid = true;

  for (const q of questions) {
    const errorEl = document.getElementById(`error-${q.id}`);
    const section = document.querySelector(`[data-qid="${q.id}"]`);
    if (!errorEl || !section) continue;

    let errorMsg = "";
    switch (q.type) {
      case "single": {
        if (q.required === false) break;
        const sel = section.querySelector(".btn-option.selected") as HTMLElement | null;
        const radio = section.querySelector(`input[name="q_${q.id}"]:checked`) as HTMLInputElement | null;
        if (q.variant === "yesno") {
          if (!sel) errorMsg = t("errYesNo", { h: q.header });
        } else if (q.variant === "rating") {
          if (!sel) errorMsg = t("errSelectRating", { h: q.header });
        } else {
          if (!radio) errorMsg = t("errSelectOne", { h: q.header });
        }
        break;
      }
      case "multi": {
        if (q.required === false) break;
        const checked = section.querySelectorAll(`input[name="q_${q.id}"]:checked`);
        if (checked.length === 0) errorMsg = t("errMultiMin", { h: q.header });
        break;
      }
      case "text": {
        const ta = section.querySelector("textarea") as HTMLTextAreaElement | null;
        if (!ta) break;
        // DESIGN.md §1773 — length check uses the raw value (not trimmed),
        // matching server-side validation.
        if (q.required !== false && ta.value.trim() === "") {
          errorMsg = t("errTextRequired", { h: q.header });
        } else if (q.max_length && ta.value.length > q.max_length) {
          errorMsg = t("errTextTooLong", { h: q.header, n: q.max_length });
        }
        break;
      }
    }

    if (errorMsg) {
      errorEl.textContent = errorMsg;
      errorEl.classList.remove("hidden");
      valid = false;
    } else {
      errorEl.textContent = "";
      errorEl.classList.add("hidden");
    }
  }

  if (additionalNotes) {
    const errorEl = document.getElementById("error-additional_notes");
    const ta = document.getElementById("additional_notes") as HTMLTextAreaElement | null;
    if (errorEl && ta) {
      let errorMsg = "";
      if (additionalNotes.required && ta.value.trim() === "") {
        errorMsg = t("errNotesRequired");
      } else if (additionalNotes.max_length && ta.value.length > additionalNotes.max_length) {
        errorMsg = t("errNotesTooLong", { n: additionalNotes.max_length });
      }
      if (errorMsg) {
        errorEl.textContent = errorMsg;
        errorEl.classList.remove("hidden");
        valid = false;
      } else {
        errorEl.textContent = "";
        errorEl.classList.add("hidden");
      }
    }
  }

  return valid;
}

// ---------------------------------------------------------------------------
// Form collection
// ---------------------------------------------------------------------------

function collectFormValues(questions: Question[]): Record<string, Answer> {
  const answers: Record<string, Answer> = {};
  for (const q of questions) {
    const section = document.querySelector(`[data-qid="${q.id}"]`);
    if (!section) continue;
    const answer: Answer = { selected: "" };
    switch (q.type) {
      case "single": {
        if (q.variant === "yesno" || q.variant === "rating") {
          const sel = section.querySelector(".btn-option.selected") as HTMLElement | null;
          answer.selected = sel?.dataset.value || "";
        } else {
          const sel = section.querySelector(`input[name="q_${q.id}"]:checked`) as HTMLInputElement | null;
          answer.selected = sel?.value || "";
        }
        break;
      }
      case "multi": {
        const checked = section.querySelectorAll(`input[name="q_${q.id}"]:checked`) as NodeListOf<HTMLInputElement>;
        answer.selected = Array.from(checked).map((cb) => cb.value);
        break;
      }
      case "text": {
        const ta = section.querySelector("textarea") as HTMLTextAreaElement | null;
        answer.selected = ta?.value.trim() || "";
        break;
      }
    }
    const ct = section.querySelector(".custom-text") as HTMLInputElement | null;
    answer.custom_text = ct?.value.trim() || "";
    answers[q.id] = answer;
  }
  return answers;
}

// ---------------------------------------------------------------------------
// Submit handler — VALIDATE is a distinct transition (DESIGN.md §923-929).
// ---------------------------------------------------------------------------

function handleSubmit(sessionId: string, round: RoundData, questions: Question[]) {
  // DESIGN.md §923 — VALIDATE is a distinct state. The VALIDATE render is
  // identical to RENDER_QUESTIONS, but re-rendering here rebuilds the form DOM
  // from scratch (formCache has no entry for the in-flight round yet) and
  // discards the user's selections, so validation would always read an empty
  // form and fail. Capture the current DOM values BEFORE any re-render, cache
  // them keyed by round so the VALIDATE render preserves them, then validate
  // against the freshly-rendered (but values-preserved) form.
  const captured = collectFormValues(questions);
  const notesEl = document.getElementById("additional_notes") as HTMLTextAreaElement | null;
  const notes = notesEl?.value.trim() || undefined;
  formCache.set(round.round, captured);

  transition({ type: "VALIDATE", round, sessionId });

  const additionalNotes = round.grilling.additional_notes;
  if (!validate(questions, additionalNotes)) {
    // Validation failed — inline errors are now surfaced on the re-rendered
    // (values-preserved) form. Stay in VALIDATE; the user corrects and re-
    // submits. formCache retains the values across the re-render.
    return;
  }

  submitResponse(sessionId, round.round, captured, notes);
}

// ---------------------------------------------------------------------------
// Banner — retry resubmits the pending data (not a round reload).
// DESIGN.md §929/§971 — preserve all filled values on failure.
// ---------------------------------------------------------------------------

function showBanner(message: string) {
  const banner = document.getElementById("banner");
  if (!banner) return;
  banner.replaceChildren();
  banner.textContent = message;
  banner.classList.remove("hidden");

  const retry = document.createElement("button");
  retry.textContent = t("retry");
  retry.className = "btn-pill btn-retry";
  retry.addEventListener("click", () => {
    banner.classList.add("hidden");
    // Resubmit the pending payload if present (preserves form data); otherwise
    // fall back to GET current.
    if (pendingSubmit) {
      submitResponse(
        pendingSubmit.sessionId,
        pendingSubmit.round,
        pendingSubmit.answers,
        pendingSubmit.additionalNotes,
      );
    } else {
      const sid = getSessionId();
      if (sid) fetchCurrent(sid);
    }
  });
  banner.appendChild(retry);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

main();
