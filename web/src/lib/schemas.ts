// Zod validation schemas — frontend UX-only validation (DESIGN.md §974-999).
//
// The server re-validates independently; these schemas exist to give the user
// immediate inline feedback before POST /response. Rules mirror DESIGN.md §980-992:
//   - single (default/yesno/rating): required → must select
//   - multi: required → at least one
//   - text: required → non-empty (trimmed); max_length → length check
//   - additional_notes: required → non-empty; max_length → length check
//
// Note: server-side text max_length uses byte length (s.len()); here we use
// character length (.max(n)) which is more permissive for UX — the server is
// the authoritative gate.

import { z } from "zod";

/** Helper: a non-empty string after trim, for required text fields. */
const nonEmpty = z
  .string()
  .trim()
  .min(1, "required");

/** Build a schema for a single question answer based on its variant. */
function singleAnswerSchema(_variant: string | undefined, required: boolean) {
  const base = z.object({
    selected: z.string(),
    custom_text: z.string().optional().default(""),
  });

  if (required) {
    // selected must be non-empty for required singles
    return base.refine((v) => v.selected !== "", {
      message: "required",
      path: ["selected"],
    });
  }
  return base;
}

/** Multi answer: array of selected labels. */
function multiAnswerSchema(required: boolean) {
  const base = z.object({
    selected: z.array(z.string()),
    custom_text: z.string().optional().default(""),
  });

  if (required) {
    return base.refine((v) => v.selected.length > 0, {
      message: "min-one",
      path: ["selected"],
    });
  }
  return base;
}

/** Text answer: string, possibly with max_length. */
function textAnswerSchema(required: boolean, maxLength?: number) {
  let sel = z.string();
  if (required) {
    sel = nonEmpty;
  }
  if (maxLength !== undefined) {
    sel = sel.max(maxLength, { message: "too-long" });
  }
  return z.object({
    selected: sel,
    custom_text: z.string().optional().default(""),
  });
}

export { singleAnswerSchema, multiAnswerSchema, textAnswerSchema };

/**
 * Build the validation schema for a full round's form.
 * Returns a Zod object keyed by question id, plus an optional additional_notes
 * field. Used as the RHF resolver schema.
 */
export function buildRoundSchema(
  questions: { id: string; type: string; variant?: string; required?: boolean; max_length?: number }[],
  additionalNotes?: { required?: boolean; max_length?: number } | null,
) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const q of questions) {
    const required = q.required !== false; // default true
    switch (q.type) {
      case "single":
        shape[q.id] = singleAnswerSchema(q.variant, required);
        break;
      case "multi":
        shape[q.id] = multiAnswerSchema(required);
        break;
      case "text":
        shape[q.id] = textAnswerSchema(required, q.max_length);
        break;
    }
  }

  if (additionalNotes) {
    let notes = z.string();
    if (additionalNotes.required) {
      notes = nonEmpty;
    }
    if (additionalNotes.max_length !== undefined) {
      notes = notes.max(additionalNotes.max_length, { message: "too-long" });
    }
    shape.additional_notes = notes;
  }

  return z.object(shape);
}

/** Re-export z for convenience in components. */
export { z };
