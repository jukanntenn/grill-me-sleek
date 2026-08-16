use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::Json;
use garde::Validate;
use serde::Deserialize;
use std::time::Duration;

use crate::AppState;
use crate::db;
use crate::error::ApiError;
#[expect(
    unused_imports,
    reason = "GoneResponse is referenced by utoipa proc macro; compiler cannot detect proc-macro usage"
)]
use crate::models::{
    ConflictResponse, ErrorResponse, GoneResponse, PendingResponse, Response, ResponseInput,
    Revised, SessionStatus,
};
use crate::session::{time_now, unix_to_rfc3339};
use std::time::Instant;

/// GET /v1/sessions/{session_id}/rounds/{seq}/response — Long-poll for user response.
///
/// Blocks up to `wait` seconds for the user to submit a response.
/// Returns 200 if submitted, 202 if timed out, 410 if terminal.
#[utoipa::path(
    get,
    path = "/v1/sessions/{session_id}/rounds/{round}/response",
    tag = "response",
    params(
        ("session_id" = String, Path, description = "Session identifier"),
        ("round" = i64, Path, description = "Round sequence number"),
        ("wait" = Option<u64>, Query, description = "Maximum wait time in seconds (max 60)")
    ),
    responses(
        (status = 200, description = "Response submitted by user", body = Response),
        (status = 202, description = "Timed out, still pending", body = PendingResponse),
        (status = 404, description = "Session or round not found", body = ErrorResponse),
        (status = 410, description = "Session in terminal state (cancelled/expired)")
    )
)]
#[tracing::instrument(skip(state), fields(session_id = %session_id, round = %seq))]
pub async fn long_poll_response(
    State(state): State<AppState>,
    Path((session_id, seq)): Path<(String, i64)>,
    Query(params): Query<WaitParam>,
) -> Result<ResponseResult, ApiError> {
    let wait = params.wait.unwrap_or(crate::config::LONGPOLL_WAIT).min(60);
    let poll_start = Instant::now();
    // Unix-seconds anchor for the revision check: revisions recorded at or
    // after this moment are surfaced in a pending 202 (see check_revision).
    let wait_started = time_now();

    // Verify session exists (any state — we need to detect terminal).
    // DESIGN.md §481-493: the response endpoint distinguishes terminal state via
    // body shape {status:"cancelled",reason?} or {status:"expired"} — NOT the
    // {status:"gone",detail} shape used by GET /sessions/{id}.
    match db::lookup_session(&state.pool, &session_id).await? {
        db::SessionLookup::Active(_) => {}
        db::SessionLookup::Terminal {
            status,
            cancel_reason,
            ..
        } => {
            record_poll_duration(poll_start);
            return Ok(terminal_response_result(
                status,
                cancel_reason.unwrap_or_default(),
            ));
        }
        db::SessionLookup::NotFound => return Err(ApiError::not_found()),
    }

    // Verify round exists
    if !db::round_exists(&state.pool, &session_id, seq).await? {
        return Err(ApiError::not_found());
    }

    // Get the SessionHandle for this session
    let handle = state
        .handles
        .get(&session_id)
        .ok_or_else(ApiError::not_found)?
        .clone();

    // Check-then-wait loop
    loop {
        // ① Check DB first
        if let Some(response_json) = db::get_response(&state.pool, &session_id, seq).await? {
            let response: Response = serde_json::from_str(&response_json)?;
            record_poll_duration(poll_start);
            return Ok(ResponseResult::Ok(response));
        }

        // ② Wait on Notify with timeout + cancellation
        let notified = handle.agent_notify.notified();
        tokio::pin!(notified);

        tokio::select! {
            _ = notified => {
                // Woken up — a submission or a revision landed somewhere in
                // this session. Own round's response was already re-checked
                // (missed) at ①, so the only new information can be a
                // revision on another round; surface it and let the caller
                // decide (CLI prints it and re-polls).
                if let Some(revised) = check_revision(&state, &session_id, seq, wait_started).await? {
                    record_poll_duration(poll_start);
                    return Ok(ResponseResult::Pending { revised: Some(revised) });
                }
                continue;
            }
            _ = tokio::time::sleep(Duration::from_secs(wait)) => {
                // Timed out. Same-second edge: a revision may have landed
                // without this waiter observing the notify — check once more
                // so it is never silently dropped.
                let revised = check_revision(&state, &session_id, seq, wait_started).await?;
                record_poll_duration(poll_start);
                return Ok(ResponseResult::Pending { revised });
            }
            _ = handle.cancel_token.cancelled() => {
                // Session entered terminal state — re-check via lookup_session
                // which handles both active-table and archive-table lookups.
                match db::lookup_session(&state.pool, &session_id).await? {
                    db::SessionLookup::Terminal { status, cancel_reason, .. } => {
                        record_poll_duration(poll_start);
                        return Ok(terminal_response_result(status, cancel_reason.unwrap_or_default()));
                    }
                    db::SessionLookup::Active(_) => {
                        // Still active after cancel signal — loop again
                        continue;
                    }
                    db::SessionLookup::NotFound => return Err(ApiError::not_found()),
                }
            }
        }
    }
}

/// Revision-check shared by the wake and timeout paths of the long-poll loop:
/// returns the latest revision recorded on *another* round of this session
/// at/after `since`, if any.
async fn check_revision(
    state: &AppState,
    session_id: &str,
    own_seq: i64,
    since: i64,
) -> Result<Option<Revised>, ApiError> {
    Ok(
        match db::latest_revision_since(&state.pool, session_id, since).await? {
            Some((round, revision)) if round != own_seq => Some(Revised { round, revision }),
            _ => None,
        },
    )
}

/// POST /v1/sessions/{session_id}/rounds/{seq}/response — Submit user response.
#[utoipa::path(
    post,
    path = "/v1/sessions/{session_id}/rounds/{round}/response",
    tag = "response",
    request_body = ResponseInput,
    params(
        ("session_id" = String, Path, description = "Session identifier"),
        ("round" = i64, Path, description = "Round sequence number")
    ),
    responses(
        (status = 201, description = "Response submitted successfully", body = Response),
        (status = 400, description = "Invalid request body", body = ErrorResponse),
        (status = 404, description = "Session or round not found", body = ErrorResponse),
        (status = 409, description = "Response already submitted for this round", body = ConflictResponse)
    )
)]
#[tracing::instrument(skip(state, body), fields(session_id = %session_id, round = %seq))]
pub async fn submit_response(
    State(state): State<AppState>,
    Path((session_id, seq)): Path<(String, i64)>,
    Json(body): Json<ResponseInput>,
) -> Result<(StatusCode, Json<Response>), ApiError> {
    // Verify session is active
    let _session_row = db::get_session_or_gone(&state.pool, &session_id).await?;

    // Verify round exists
    let round = db::get_round(&state.pool, &session_id, seq)
        .await?
        .ok_or_else(ApiError::not_found)?;

    // Validate response against the grilling schema (garde struct-level
    // custom: cross-field rules driven by the persisted Grilling as context).
    let grilling = crate::db::deserialize_grilling(&round.grilling)?;
    body.validate_with(&grilling)
        .map_err(|e| ApiError::bad_request(format!("validation failed: {e}")))?;

    let now = time_now();
    let submitted_at = unix_to_rfc3339(now);

    // Build the full Response (first submission: revision 1, never revised)
    let response = Response {
        round: seq,
        answers: body.answers,
        additional_notes: body.additional_notes,
        submitted_at,
        revision: 1,
        revised_at: None,
    };

    let response_json = serde_json::to_string(&response)?;

    // Conditional UPDATE — only if response IS NULL
    let submitted = db::submit_response(&state.pool, &session_id, seq, &response_json).await?;

    if !submitted {
        // Concurrent conflict — another submission won
        let existing_json = db::get_response(&state.pool, &session_id, seq)
            .await?
            .ok_or(ApiError::internal(anyhow::anyhow!(
                "response should exist after conflict"
            )))?;
        let existing: Response = serde_json::from_str(&existing_json)?;
        return Err(ApiError::round_already_submitted(seq, existing));
    }

    // Wake up long-poll waiters
    if let Some(handle) = state.handles.get(&session_id) {
        handle.agent_notify.notify_waiters();
        handle
            .sse_hub
            .broadcast(crate::sse::SseEvent::response_created(seq));
    }

    // Record metrics
    crate::observability::metrics::record_response_received();

    tracing::info!(session_id = %session_id, round = seq, "response submitted");
    Ok((StatusCode::CREATED, Json(response)))
}

/// PUT /v1/sessions/{session_id}/rounds/{seq}/response — Revise a submitted
/// response. Only rounds that already have a response can be revised; the
/// revision replaces the stored answers (latest wins) and bumps the counter.
#[utoipa::path(
    put,
    path = "/v1/sessions/{session_id}/rounds/{round}/response",
    tag = "response",
    request_body = ResponseInput,
    params(
        ("session_id" = String, Path, description = "Session identifier"),
        ("round" = i64, Path, description = "Round sequence number")
    ),
    responses(
        (status = 200, description = "Response revised", body = Response),
        (status = 400, description = "Invalid request body", body = ErrorResponse),
        (status = 404, description = "Session or round not found", body = ErrorResponse),
        (status = 409, description = "Round has no response yet — submit via POST first", body = ErrorResponse),
        (status = 410, description = "Session in terminal state", body = ErrorResponse)
    )
)]
#[tracing::instrument(skip(state, body), fields(session_id = %session_id, round = %seq))]
pub async fn revise_response(
    State(state): State<AppState>,
    Path((session_id, seq)): Path<(String, i64)>,
    Json(body): Json<ResponseInput>,
) -> Result<Json<Response>, ApiError> {
    // Verify session is active
    let _session_row = db::get_session_or_gone(&state.pool, &session_id).await?;

    // Verify round exists
    let round = db::get_round(&state.pool, &session_id, seq)
        .await?
        .ok_or_else(ApiError::not_found)?;

    // Must already be answered — PUT revises, it does not create.
    let existing_json = db::get_response(&state.pool, &session_id, seq)
        .await?
        .ok_or_else(|| ApiError::round_not_answered(seq))?;
    let existing: Response = serde_json::from_str(&existing_json)?;

    // Same validation rules as a first submission, against the same grilling.
    let grilling = crate::db::deserialize_grilling(&round.grilling)?;
    body.validate_with(&grilling)
        .map_err(|e| ApiError::bad_request(format!("validation failed: {e}")))?;

    let now = time_now();
    let revised_at = unix_to_rfc3339(now);

    // The closure receives the atomically-allocated revision number, so the
    // stored JSON's `revision` field always matches the `rounds.revision`
    // column even under concurrent PUTs.
    let outcome = db::revise_response(
        &state.pool,
        &session_id,
        seq,
        |revision| {
            Ok(serde_json::to_string(&Response {
                round: seq,
                answers: body.answers.clone(),
                additional_notes: body.additional_notes.clone(),
                // First-submission timestamp is immutable across revisions.
                submitted_at: existing.submitted_at.clone(),
                revision,
                revised_at: Some(revised_at.clone()),
            })?)
        },
        now,
    )
    .await?;

    let Some((response_json, revision)) = outcome else {
        // Lost a race with… nothing modifies response except PUT; reaching
        // here means the response vanished between read and update.
        return Err(ApiError::round_not_answered(seq));
    };
    let response: Response = serde_json::from_str(&response_json)?;

    // Wake ALL long-poll waiters in the session: waiters on this round
    // re-check and return the revised response; waiters on other rounds
    // return 202 with the revision notice.
    if let Some(handle) = state.handles.get(&session_id) {
        handle.agent_notify.notify_waiters();
        handle
            .sse_hub
            .broadcast(crate::sse::SseEvent::response_revised(seq, revision));
    }

    tracing::info!(session_id = %session_id, round = seq, revision, "response revised");
    Ok(Json(response))
}

/// Query parameters for the long-poll endpoint.
#[derive(Debug, Deserialize)]
pub struct WaitParam {
    pub wait: Option<u64>,
}

/// Result type for the long-poll endpoint.
#[derive(Debug)]
pub enum ResponseResult {
    /// 200: Response submitted
    Ok(Response),
    /// 202: Still pending; `revised` carries a revision that landed on
    /// another round while this request was waiting (if any).
    Pending { revised: Option<Revised> },
    /// Cancelled (wrapped into 410 response)
    Cancelled { reason: String },
    /// Expired (wrapped into 410 response)
    Expired,
}

impl axum::response::IntoResponse for ResponseResult {
    fn into_response(self) -> axum::response::Response {
        match self {
            ResponseResult::Ok(response) => (StatusCode::OK, Json(response)).into_response(),
            ResponseResult::Pending { revised } => {
                let body = PendingResponse {
                    status: "pending".to_string(),
                    revised,
                };
                (StatusCode::ACCEPTED, Json(body)).into_response()
            }
            ResponseResult::Cancelled { reason } => (
                StatusCode::GONE,
                Json(serde_json::json!({"status": "cancelled", "reason": reason})),
            )
                .into_response(),
            ResponseResult::Expired => (
                StatusCode::GONE,
                Json(serde_json::json!({"status": "expired"})),
            )
                .into_response(),
        }
    }
}

/// Record the long-poll wait duration metric.
fn record_poll_duration(start: Instant) {
    let elapsed = start.elapsed().as_secs_f64();
    crate::observability::metrics::record_longpoll_duration(elapsed);
}

/// Map a `SessionStatus` to the response-endpoint terminal result variant.
///
/// DESIGN.md §481-493: this endpoint uses `{status:"cancelled",reason?}` and
/// `{status:"expired"}` — distinct from GET /sessions/{id}'s `{status:"gone",detail}`.
fn terminal_response_result(status: SessionStatus, reason: String) -> ResponseResult {
    match status {
        SessionStatus::Cancelled => ResponseResult::Cancelled { reason },
        _ => ResponseResult::Expired,
    }
}
