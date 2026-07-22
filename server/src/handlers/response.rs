use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::Json;
use garde::Validate;
use serde::Deserialize;
use std::time::Duration;

use crate::AppState;
use crate::db;
use crate::error::ApiError;
use crate::models::*;
use crate::observability::metrics::metrics;
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

    // Verify session exists (any state — we need to detect terminal).
    // After archival the active row is gone, so fall back to the archive table
    // to distinguish "never existed" (404) from "existed but terminal" (410).
    let session_row = match db::get_session(&state.pool, &session_id).await? {
        Some(row) => row,
        None => {
            // Check archive for a prior terminal transition.
            if let Some((status_int, reason)) =
                db::get_archive_status(&state.pool, &session_id).await?
            {
                record_poll_duration(poll_start);
                return Ok(terminal_result_for_status(
                    status_int,
                    reason.unwrap_or_default(),
                ));
            }
            return Err(ApiError::NotFound);
        }
    };

    // DESIGN.md §481-493: the response endpoint distinguishes terminal state via
    // body shape {status:"cancelled",reason?} or {status:"expired"} — NOT the
    // {status:"gone",detail} shape used by GET /sessions/{id}. cancelled carries
    // the reason; expired has none.
    if session_row.status != 0 {
        record_poll_duration(poll_start);
        return Ok(terminal_result_for_status(
            session_row.status,
            session_row.cancel_reason.unwrap_or_default(),
        ));
    }

    // Verify round exists
    if !db::round_exists(&state.pool, &session_id, seq).await? {
        return Err(ApiError::NotFound);
    }

    // Get the SessionHandle for this session
    let handle = state
        .handles
        .get(&session_id)
        .ok_or(ApiError::NotFound)?
        .clone();

    // Check-then-wait loop
    loop {
        // ① Check DB first
        if let Some(response_json) = db::get_response(&state.pool, &session_id, seq).await? {
            let response: Response = serde_json::from_str(&response_json).map_err(|e| {
                ApiError::internal(anyhow::anyhow!("failed to deserialize response: {e}"))
            })?;
            record_poll_duration(poll_start);
            return Ok(ResponseResult::Ok(response));
        }

        // ② Wait on Notify with timeout + cancellation
        let notified = handle.agent_notify.notified();
        tokio::pin!(notified);

        tokio::select! {
            _ = notified => {
                // Woken up — loop back to check DB
                continue;
            }
            _ = tokio::time::sleep(Duration::from_secs(wait)) => {
                // Timed out
                record_poll_duration(poll_start);
                return Ok(ResponseResult::Pending);
            }
            _ = handle.cancel_token.cancelled() => {
                // Session entered terminal state — re-check DB.
                // The session may have been archived between the cancel_token firing
                // and this re-check, so fall back to the archive table.
                let session_row = match db::get_session(&state.pool, &session_id).await? {
                    Some(row) => Some(row),
                    None => {
                        // Check archive for a prior terminal transition.
                        if let Some((status_int, reason)) =
                            db::get_archive_status(&state.pool, &session_id).await?
                        {
                            record_poll_duration(poll_start);
                            return Ok(terminal_result_for_status(
                                status_int,
                                reason.unwrap_or_default(),
                            ));
                        }
                        None
                    }
                };

                let session_row = match session_row {
                    Some(row) => row,
                    None => return Err(ApiError::NotFound),
                };

                match SessionStatus::try_from(session_row.status).ok() {
                    Some(SessionStatus::Active) => continue, // still active, loop again
                    Some(SessionStatus::Cancelled) => {
                        let reason = session_row.cancel_reason.unwrap_or_default();
                        record_poll_duration(poll_start);
                        return Ok(ResponseResult::Cancelled { reason });
                    }
                    // completed (1), expired (3), or any other terminal: surface as
                    // expired-style per response-endpoint body contract.
                    _ => {
                        record_poll_duration(poll_start);
                        return Ok(ResponseResult::Expired);
                    }
                }
            }
        }
    }
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
        .ok_or(ApiError::NotFound)?;

    // Validate response against the grilling schema (garde struct-level
    // custom: cross-field rules driven by the persisted Grilling as context).
    let grilling = super::deserialize_grilling(&round.grilling)?;
    body.validate_with(&grilling)
        .map_err(|e| ApiError::BadRequest(format!("validation failed: {e}")))?;

    let now = time_now();
    let submitted_at = unix_to_rfc3339(now);

    // Build the full Response
    let response = Response {
        round: seq,
        answers: body.answers,
        additional_notes: body.additional_notes,
        submitted_at,
    };

    let response_json = serde_json::to_string(&response)
        .map_err(|e| ApiError::internal(anyhow::anyhow!("failed to serialize response: {e}")))?;

    // Conditional UPDATE — only if response IS NULL
    let submitted = db::submit_response(&state.pool, &session_id, seq, &response_json).await?;

    if !submitted {
        // Concurrent conflict — another submission won
        let existing_json = db::get_response(&state.pool, &session_id, seq)
            .await?
            .ok_or(ApiError::internal(anyhow::anyhow!(
                "response should exist after conflict"
            )))?;
        let existing: Response = serde_json::from_str(&existing_json).map_err(|e| {
            ApiError::internal(anyhow::anyhow!(
                "failed to deserialize existing response: {e}"
            ))
        })?;
        return Err(ApiError::RoundAlreadySubmitted {
            round: seq,
            response: existing,
        });
    }

    // Wake up long-poll waiters
    if let Some(handle) = state.handles.get(&session_id) {
        handle.agent_notify.notify_waiters();
        handle
            .sse_hub
            .broadcast(crate::sse::SseEvent::response_created(seq));
    }

    // Record metrics
    if let Some(m) = metrics() {
        m.responses_received_total.add(1, &[]);
    }

    tracing::info!(session_id = %session_id, round = seq, "response submitted");
    Ok((StatusCode::CREATED, Json(response)))
}

/// Query parameters for the long-poll endpoint.
#[derive(Debug, Deserialize)]
pub struct WaitParam {
    pub wait: Option<u64>,
}

/// Result type for the long-poll endpoint.
pub enum ResponseResult {
    /// 200: Response submitted
    Ok(Response),
    /// 202: Timed out, still pending
    Pending,
    /// Cancelled (wrapped into 410 response)
    Cancelled { reason: String },
    /// Expired (wrapped into 410 response)
    Expired,
}

impl axum::response::IntoResponse for ResponseResult {
    fn into_response(self) -> axum::response::Response {
        match self {
            ResponseResult::Ok(response) => (StatusCode::OK, Json(response)).into_response(),
            ResponseResult::Pending => (
                StatusCode::ACCEPTED,
                Json(serde_json::json!({"status": "pending"})),
            )
                .into_response(),
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
    if let Some(m) = metrics() {
        let elapsed = start.elapsed().as_secs_f64();
        m.longpoll_wait_seconds.record(elapsed, &[]);
    }
}

/// Map a DB status int to the response-endpoint terminal result variant.
///
/// DESIGN.md §481-493: this endpoint uses `{status:"cancelled",reason?}` and
/// `{status:"expired"}` — distinct from GET /sessions/{id}'s `{status:"gone",detail}`.
/// `reason` is only meaningful for cancelled (status=2); callers pass the raw
/// cancel_reason (possibly empty when sourced from the archive, which doesn't
/// carry it back into the active row path).
fn terminal_result_for_status(status: i64, reason: String) -> ResponseResult {
    match SessionStatus::try_from(status).ok() {
        Some(SessionStatus::Cancelled) => ResponseResult::Cancelled { reason },
        // completed (1), expired (3), or any other terminal: surface as expired-
        // style per response-endpoint body contract.
        _ => ResponseResult::Expired,
    }
}
