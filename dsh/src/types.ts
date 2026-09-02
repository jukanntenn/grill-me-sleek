/**
 * Pure types of the grilling domain: the branded round id, the model-authored
 * question record, and the link-neutral answer record. Each type has its one
 * home here; runtime code lives in the sibling modules.
 *
 * No custom `SessionEventMap` members are declared here on purpose: the
 * Harness persistence read path refuses event types outside its generated
 * `KNOWN_SESSION_EVENT_TYPES` catalog, which only in-repo packages can enter.
 * The round's durable record is the platform's own `tool/call` arguments (the
 * questions) plus `tool/result` (the answers), which the Harness logs for
 * every tool call anyway.
 *
 * @module @grilling-sleek/dsh-tool-grill-user/types
 */

import type { Branded } from "@deepseek-ai/dsh-brand";

/**
 * Stable identity of one grilling round, minted per `grill_user` call and
 * returned in the tool result (the Harness logs it there). The Hub-side
 * integer round number is a separate wire concern the hub client maps onto
 * this id for the lifetime of one runtime session.
 */
export type GrillingRoundId = Branded<"GrillingRoundId">;

/** One selectable choice of a grilling question. */
export interface GrillingOption {
  /** User-facing option label; answers echo labels back. */
  label: string;
  /** One sentence explaining the tradeoff or impact. */
  description?: string;
}

/**
 * One question of a grilling round in the model-authored form shared by the
 * tool schema and the Hub wire mapping. Optionless questions are free-text;
 * `recommended` indexes `options`.
 */
export interface GrillingQuestion {
  /** Stable snake_case id with the `grill_` prefix, unique within the round. */
  id: string;
  /** Short heading shown above the question. */
  header: string;
  /** Full question text. */
  question: string;
  /** Two or more choices; absent means a free-text question. */
  options?: GrillingOption[];
  /** Whether several options may be selected. */
  multiSelect?: boolean;
  /** Index into `options` of the recommended choice. */
  recommended?: number;
  /** Why the recommendation is made; rendered beside it. */
  explanation?: string;
  /** Whether an answer is mandatory. Defaults to true. */
  required?: boolean;
  /** Hint text for free-text answers. */
  placeholder?: string;
  /** Character cap for free-text answers. */
  maxLength?: number;
}

/** Answer to one grilling question, in the form both answer links normalize to. */
export interface GrillingAnswer {
  /** The answered question id. */
  id: string;
  /** Selected option labels; empty for free-text answers. */
  selected: string[];
  /** Free-text answer, when the question invited one. */
  custom?: string;
}

/** How a grilling round closed. */
export type GrillingOutcome = "answered" | "cancelled" | "expired";

/**
 * A user-initiated revision of an earlier round's stored answers, delivered
 * alongside a later round's result: the Hub round number, the branch name it
 * was pushed under, the revision now stored there, and the full latest
 * answers. The Hub is the source of truth — the latest revision of every
 * round supersedes whatever was delivered before.
 */
export interface GrillingRevision {
  /** Hub round number of the revised round. */
  round: number;
  /** The branch name the round was pushed under, when the Hub reports one. */
  name?: string;
  /** The revision now stored on the Hub. */
  revision: number;
  /** The revised round's full latest answers, in question order. */
  answers: GrillingAnswer[];
}
