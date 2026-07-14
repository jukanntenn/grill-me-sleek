// Type definitions for the grilling-sleek web client.
//
// Mirrors the server-side model (server/src/models/mod.rs) — the API contract
// is the single source of truth. Frontend typing is slightly looser on
// optional-vs-defaulted fields (server always emits defaults like required=true,
// allow_custom_text=true, variant="default"), but checks are functionally
// equivalent.

/** A single selectable option within a single/multi question. */
export interface OptionItem {
  label: string;
  description?: string;
}

/** Question type — determines the control rendered. */
export type QuestionType = "single" | "multi" | "text";

/** Variant for single-choice questions. */
export type Variant = "default" | "yesno" | "rating";

/** A single question in a grilling round. */
export interface Question {
  id: string;
  header: string;
  text: string;
  type: QuestionType;
  options?: OptionItem[];
  /** Index into options[] (default variant), rating value (rating), or 0/1 (yesno). */
  recommended?: number;
  variant?: Variant;
  /** Rating max, default 5, minimum 1. */
  rating_max?: number;
  placeholder?: string;
  max_length?: number;
  /** Default true. */
  required?: boolean;
  /** Default true (single/multi only). */
  allow_custom_text?: boolean;
  /** Shown alongside the recommended mark when present. */
  explanation?: string;
}

/** Global additional-notes config (distinct from per-question custom_text). */
export interface AdditionalNotes {
  label?: string;
  placeholder?: string;
  max_length?: number;
  /** Default false. */
  required?: boolean;
}

/** A grilling definition — the question set for a round. */
export interface Grilling {
  name: string;
  description?: string;
  additional_notes?: AdditionalNotes;
  questions: Question[];
}

/** A user's answer to one question. */
export interface Answer {
  /** string for single/text (yesno: "yes"/"no"; rating: numeric string "3"); string[] for multi. */
  selected: string | string[];
  custom_text?: string;
}

/** A submitted response (server-generated round + submitted_at). */
export interface ResponseData {
  round: number;
  answers: Record<string, Answer>;
  additional_notes?: string;
  submitted_at: string;
}

/** A round as returned by GET /rounds/current. */
export interface RoundData {
  round: number;
  name?: string;
  grilling: Grilling;
  response: ResponseData | null;
}

/** 410 Gone body: { status: "gone", detail: "completed"|"cancelled"|"expired" }. */
export interface GoneBody {
  status: "gone";
  detail: "completed" | "cancelled" | "expired";
}

/** 409 Conflict body: carries the already-submitted response. */
export interface ConflictBody {
  message: "round already submitted";
  status: 409;
  round: number;
  response: ResponseData;
}

/** SSE event payloads (server/src/sse/mod.rs). */
export interface RoundCreatedEvent {
  round: number;
}
export interface ResponseCreatedEvent {
  round: number;
}
export interface SessionCompletedEvent {
  session_id: string;
}
export interface SessionCancelledEvent {
  session_id: string;
  reason: string;
}
export interface SessionExpiredEvent {
  session_id: string;
}
