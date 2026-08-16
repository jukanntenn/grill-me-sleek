/**
 * Long-poll pending (202) body handling.
 *
 * The server returns 202 `{"status":"pending"}` while the polled round is
 * unanswered. When a revision lands on another round of the same session
 * while a poll is parked, the body also carries `revised` — extracted here so
 * the notice logic stays unit-testable (grilling-sleek.ts parses argv at
 * import time and cannot be imported by tests).
 */

export interface Revised {
  round: number;
  revision: number;
}

export interface PendingBody {
  status: string;
  revised?: Revised;
}

/**
 * Human-readable notice for a revision observed mid-poll, or null when the
 * pending body carries no revision. stderr line for the agent to relay.
 */
export function revisionNotice(revised: Revised): string {
  return (
    `warning: round ${revised.round} answer was revised (revision ${revised.revision}); ` +
    "fetch it before acting on older answers"
  );
}

/** Parse a 202 body, returning the `revised` field when present. */
export function parsePendingBody(raw: unknown): PendingBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw as { status?: unknown; revised?: unknown };
  if (typeof body.status !== "string") return null;
  const pending: PendingBody = { status: body.status };
  if (
    typeof body.revised === "object" &&
    body.revised !== null &&
    typeof (body.revised as Revised).round === "number" &&
    typeof (body.revised as Revised).revision === "number"
  ) {
    pending.revised = body.revised as Revised;
  }
  return pending;
}
