// API layer — fetch wrappers for the grilling-sleek backend.
//
// Endpoints (same-origin via Caddy reverse_proxy, no CORS):
//   GET  /v1/sessions/{id}/rounds/current          → 200 | 404 | 410
//   POST /v1/sessions/{id}/rounds/{n}/response      → 201 | 400 | 409 | 410 | 5xx
//   GET  /v1/sessions/{id}/events (SSE)             → handled by useSSE
//
// 410 body: { status: "gone", detail: "completed"|"cancelled"|"expired" }
// 409 body: { message, status, round, response } — carries already-submitted response.

import type { RoundData, Answer, GoneBody, ConflictBody } from "../types";

const API = "/v1";

export type FetchResult =
  | { ok: true; round: RoundData }
  | { ok: false; kind: "not-found" }
  | { ok: false; kind: "gone"; detail: GoneBody["detail"] }
  | { ok: false; kind: "retry" };

/** GET /v1/sessions/{id}/rounds/current — used for initial fetch + reconnect. */
export async function fetchCurrent(sessionId: string): Promise<FetchResult> {
  try {
    const resp = await fetch(`${API}/sessions/${sessionId}/rounds/current`);
    if (resp.ok) {
      const round = (await resp.json()) as RoundData;
      return { ok: true, round };
    }
    if (resp.status === 410) {
      const body = (await resp.json()) as GoneBody;
      return { ok: false, kind: "gone", detail: body.detail };
    }
    if (resp.status === 404) {
      return { ok: false, kind: "not-found" };
    }
    return { ok: false, kind: "retry" };
  } catch {
    return { ok: false, kind: "retry" };
  }
}

export type SubmitResult =
  | { ok: true }
  | { ok: false; kind: "conflict" }
  | { ok: false; kind: "gone"; detail: GoneBody["detail"] }
  | { ok: false; kind: "bad-request"; message: string }
  | { ok: false; kind: "server-error"; status: number }
  | { ok: false; kind: "network-error" };

/** POST /v1/sessions/{id}/rounds/{n}/response */
export async function submitResponse(
  sessionId: string,
  round: number,
  answers: Record<string, Answer>,
  additionalNotes?: string,
): Promise<SubmitResult> {
  const body: Record<string, unknown> = { answers };
  if (additionalNotes !== undefined) body.additional_notes = additionalNotes;

  try {
    const resp = await fetch(`${API}/sessions/${sessionId}/rounds/${round}/response`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (resp.status === 201) {
      return { ok: true };
    }
    if (resp.status === 409) {
      // Body carries the already-submitted response — client enters WAIT_NEXT_ROUND.
      const _body = (await resp.json()) as ConflictBody;
      void _body; // not needed for state transition, but contract guarantees it exists
      return { ok: false, kind: "conflict" };
    }
    if (resp.status === 400) {
      const err = await resp.json().catch(() => ({}));
      return { ok: false, kind: "bad-request", message: err.message ?? "" };
    }
    if (resp.status === 410) {
      const body = (await resp.json()) as GoneBody;
      return { ok: false, kind: "gone", detail: body.detail };
    }
    // 5xx or other
    return { ok: false, kind: "server-error", status: resp.status };
  } catch {
    return { ok: false, kind: "network-error" };
  }
}

/** SSE endpoint URL. */
export function sseUrl(sessionId: string): string {
  return `${API}/sessions/${sessionId}/events`;
}
