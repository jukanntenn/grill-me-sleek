use axum::extract::{ConnectInfo, FromRequestParts, Path, State};
use axum::http::{HeaderMap, StatusCode, request::Parts};
use axum::response::Json;
use std::net::{IpAddr, SocketAddr};

use crate::AppState;
use crate::db;
use crate::error::ApiError;
use crate::extractors::ValidatedJson;
use crate::idempotency::{self, IdempotencyEntry};
use crate::models::*;
use crate::observability::metrics::{ACTIVE_SESSIONS, metrics};
use crate::session::{self, SESSION_TTL, time_now, unix_to_rfc3339};
use crate::validation;

/// Custom extractor for ConnectInfo that falls back to a default SocketAddr
/// when not available (e.g., in integration tests using oneshot).
pub struct OptionalConnectInfo(SocketAddr);

impl<S> FromRequestParts<S> for OptionalConnectInfo
where
    S: Send + Sync,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let addr = parts
            .extensions
            .get::<ConnectInfo<SocketAddr>>()
            .map(|ci| ci.0)
            .unwrap_or_else(|| {
                // Fallback for tests/oneshot: use localhost
                "127.0.0.1:0".parse::<SocketAddr>().unwrap()
            });
        Ok(OptionalConnectInfo(addr))
    }
}

/// Extract client IP from headers, falling back to peer IP.
/// Caddy sets X-Forwarded-For from CF-Connecting-IP, so we trust it.
/// This mirrors SmartIp's logic but for logging (not rate limiting).
fn extract_client_ip(headers: &HeaderMap, peer: &SocketAddr) -> IpAddr {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .and_then(|s| s.trim().parse::<IpAddr>().ok())
        .unwrap_or_else(|| peer.ip())
}

/// POST /v1/sessions — Create a new session with first round.
#[utoipa::path(
    post,
    path = "/v1/sessions",
    tag = "sessions",
    request_body = serde_json::Value,
    responses(
        (status = 201, description = "Session created successfully", body = CreateSessionResponse),
        (status = 400, description = "Invalid request body", body = ErrorResponse),
        (status = 429, description = "Rate limited", body = ErrorResponse),
        (status = 503, description = "Max sessions reached", body = ErrorResponse)
    )
)]
#[tracing::instrument(skip(state, raw), fields(session_id))]
pub async fn create_session(
    State(state): State<AppState>,
    OptionalConnectInfo(peer): OptionalConnectInfo,
    headers: HeaderMap,
    Json(raw): Json<serde_json::Value>,
) -> Result<(StatusCode, Json<CreateSessionResponse>), ApiError> {
    // Extract client IP for logging
    let client_ip = extract_client_ip(&headers, &peer);

    // Validate Grilling (JSON Schema + question-id uniqueness). Receiving a raw
    // Value (not Json<Grilling>) ensures schema violations return 400 from our
    // authoritative jsonschema check, rather than axum's 422 serde rejection.
    let body: Grilling = validation::validate_grilling_value(&raw)?;

    let idempotency_key = headers
        .get("Idempotency-Key")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let body_hash = idempotency::hash_body(&serde_json::to_vec(&raw).unwrap_or_default());

    // The creation closure: generates an ID, writes the session+first round,
    // registers the SessionHandle, and builds the response entry. Under an
    // idempotency key, moka's `try_get_with` coalesces concurrent calls into a
    // single evaluation of this closure (DESIGN.md §1481).
    let state_for_create = state.clone();
    let create = move || async move {
        // Check session capacity
        if state_for_create.handles.len() >= session::MAX_SESSIONS {
            record_rejected("max_sessions");
            return Err(ApiError::MaxSessions);
        }

        // Generate session ID (retry on collision, max 3 times)
        let mut session_id = session::generate_session_id();
        for attempt in 0..3 {
            let now = time_now();
            let expires_at = now + SESSION_TTL;

            match db::create_session(&state_for_create.pool, &session_id, &body, now, expires_at)
                .await
            {
                Ok(_round_id) => {
                    if !session::register_session(&state_for_create.handles, session_id.clone()) {
                        record_rejected("max_sessions");
                        return Err(ApiError::MaxSessions);
                    }

                    let url = format!("{}/#{session_id}", state_for_create.base_url);
                    let response = CreateSessionResponse {
                        session_id: session_id.clone(),
                        url,
                        status: "active".to_string(),
                        current_round: 1,
                        name: Some(body.name.clone()),
                        description: body.description.clone(),
                        created_at: unix_to_rfc3339(now),
                        expires_at: unix_to_rfc3339(expires_at),
                    };

                    if let Some(m) = metrics() {
                        m.sessions_created_total.add(1, &[]);
                        let active =
                            ACTIVE_SESSIONS.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
                        m.sessions_active.record(active as u64, &[]);
                    }

                    tracing::info!(session_id = %session_id, client_ip = %client_ip, "session created");
                    return Ok(IdempotencyEntry {
                        response_body: serde_json::to_string(&response).unwrap_or_default(),
                        status_code: 201,
                        body_hash,
                    });
                }
                Err(e) => {
                    if let Some(sqlx::Error::Database(db_err)) = e.downcast_ref::<sqlx::Error>() {
                        // SQLite extended result code 197 = SQLITE_CONSTRAINT_PRIMARYKEY
                        if db_err.code().is_some_and(|c| c == "197") && attempt < 2 {
                            session_id = session::generate_session_id();
                            continue;
                        }
                    }
                    return Err(ApiError::internal(e));
                }
            }
        }
        Err(ApiError::internal(anyhow::anyhow!(
            "failed to generate unique session ID after 3 attempts"
        )))
    };

    let entry = idempotency::run_idempotent(
        &state.idempotency_sessions,
        idempotency_key,
        body_hash,
        create,
    )
    .await?;

    let response: CreateSessionResponse = serde_json::from_str(&entry.response_body)
        .map_err(|e| ApiError::internal(anyhow::anyhow!("failed to deserialize response: {e}")))?;
    Ok((
        StatusCode::from_u16(entry.status_code).unwrap_or(StatusCode::CREATED),
        Json(response),
    ))
}

/// GET /v1/sessions/{session_id} — Get session state.
#[utoipa::path(
    get,
    path = "/v1/sessions/{session_id}",
    tag = "sessions",
    params(
        ("session_id" = String, Path, description = "Session identifier")
    ),
    responses(
        (status = 200, description = "Session state", body = SessionState),
        (status = 404, description = "Session not found", body = ErrorResponse),
        (status = 410, description = "Session gone (expired/completed/cancelled)", body = GoneResponse)
    )
)]
pub async fn get_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> Result<Json<SessionState>, ApiError> {
    let row = db::get_session_or_gone(&state.pool, &session_id).await?;

    // Get current round number and description from curr_round
    let (current_round, description) = if let Some(round_id) = row.curr_round {
        match db::get_round_by_id(&state.pool, round_id).await? {
            Some(r) => {
                let desc = serde_json::from_str::<Grilling>(&r.grilling)
                    .ok()
                    .and_then(|g| g.description);
                (r.seq, desc)
            }
            None => (1, None),
        }
    } else {
        (1, None)
    };

    Ok(Json(SessionState {
        session_id: row.id,
        status: "active".to_string(),
        current_round,
        name: row.name,
        description,
        created_at: unix_to_rfc3339(row.created_at),
        expires_at: unix_to_rfc3339(row.expires_at),
    }))
}

/// PATCH /v1/sessions/{session_id} — Update session (complete/cancel).
#[utoipa::path(
    patch,
    path = "/v1/sessions/{session_id}",
    tag = "sessions",
    request_body = SessionUpdate,
    params(
        ("session_id" = String, Path, description = "Session identifier")
    ),
    responses(
        (status = 200, description = "Session updated", body = SessionState),
        (status = 404, description = "Session not found", body = ErrorResponse),
        (status = 409, description = "Session already in terminal state", body = ErrorResponse)
    )
)]
#[tracing::instrument(skip(state, body), fields(session_id = %session_id))]
pub async fn update_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    ValidatedJson(body): ValidatedJson<SessionUpdate>,
) -> Result<Json<SessionState>, ApiError> {
    // Verify session exists. DESIGN.md §348: A PATCH on a terminal session
    // returns 409 TerminalState (not 404 / 410). However, to handle retried
    // requests idempotently (ky retries PATCH on network errors), if the
    // session is already in the requested terminal state, return the current
    // state instead of 409.
    let desired_status = match body.status {
        SessionUpdateStatus::Completed => SessionStatus::Completed,
        SessionUpdateStatus::Cancelled => SessionStatus::Cancelled,
    };

    let row = match db::get_session(&state.pool, &session_id).await? {
        Some(row) => row,
        None => {
            // Active row gone — check archive: if present, it's terminal.
            if let Some((status_int, _reason)) =
                db::get_archive_status(&state.pool, &session_id).await?
            {
                // Idempotent: already in the desired terminal state → return success.
                if SessionStatus::try_from(status_int).ok() == Some(desired_status) {
                    return Ok(Json(terminal_session_state(
                        session_id,
                        &desired_status,
                        None,
                    )));
                }
                return Err(ApiError::TerminalState);
            }
            return Err(ApiError::NotFound);
        }
    };

    if row.status != 0 {
        // Idempotent: already in the desired terminal state → return success.
        if SessionStatus::try_from(row.status).ok() == Some(desired_status) {
            return Ok(Json(terminal_session_state(
                session_id,
                &desired_status,
                Some(&row),
            )));
        }
        return Err(ApiError::TerminalState);
    }

    // DESIGN.md §653 — server-authoritative: reason/reason_detail/actor are only
    // adopted when status=cancelled; for status=completed they are ignored
    // (cancel_* columns written NULL). No 400 for missing/extra fields — be
    // tolerant of agents. The schema layer already constrains `reason` to the
    // enum {user_cancelled, agent_aborted, error} and `actor` to {user, agent}.
    let now = time_now();

    // Determine cancel fields
    let (cancel_reason, cancel_detail, cancel_actor) = match body.status {
        SessionUpdateStatus::Completed => (None, None, None),
        SessionUpdateStatus::Cancelled => {
            let reason = body.reason.map(|r| match r {
                CancelReason::UserCancelled => "user_cancelled".to_string(),
                CancelReason::AgentAborted => "agent_aborted".to_string(),
                CancelReason::Error => "error".to_string(),
            });
            let actor = body.actor.map(|a| match a {
                Actor::User => "user".to_string(),
                Actor::Agent => "agent".to_string(),
            });
            (reason, body.reason_detail, actor)
        }
    };

    // Update session status
    let affected = db::update_session_status(
        &state.pool,
        &session_id,
        desired_status as i64,
        cancel_reason.as_deref(),
        cancel_detail.as_deref(),
        cancel_actor.as_deref(),
    )
    .await?;

    if affected == 0 {
        // Concurrent update — re-check if already in the desired state.
        if let Some(row) = db::get_session(&state.pool, &session_id).await? {
            if SessionStatus::try_from(row.status).ok() == Some(desired_status) {
                return Ok(Json(terminal_session_state(
                    session_id,
                    &desired_status,
                    Some(&row),
                )));
            }
        } else if let Some((status_int, _)) =
            db::get_archive_status(&state.pool, &session_id).await?
        {
            if SessionStatus::try_from(status_int).ok() == Some(desired_status) {
                return Ok(Json(terminal_session_state(
                    session_id,
                    &desired_status,
                    None,
                )));
            }
        }
        return Err(ApiError::TerminalState);
    }

    // Broadcast terminal SSE event and cleanup handle
    if let Some((_, handle)) = state.handles.remove(&session_id) {
        let event = match desired_status {
            SessionStatus::Completed => crate::sse::SseEvent::session_completed(&session_id),
            SessionStatus::Cancelled => crate::sse::SseEvent::session_cancelled(
                &session_id,
                cancel_reason.as_deref().unwrap_or("unknown"),
            ),
            _ => unreachable!(),
        };
        handle.sse_hub.broadcast(event);
        handle.cancel_token.cancel();
        handle.agent_notify.notify_waiters();
    }

    // Archive the session
    db::archive_session(&state.pool, &session_id, desired_status as i64, now).await?;

    // Record metrics
    if let Some(m) = metrics() {
        let active = ACTIVE_SESSIONS.fetch_sub(1, std::sync::atomic::Ordering::Relaxed) - 1;
        m.sessions_active.record(active as u64, &[]);
    }

    tracing::info!(session_id = %session_id, status = %desired_status.as_str(), "session updated");

    Ok(Json(terminal_session_state(
        session_id,
        &desired_status,
        Some(&row),
    )))
}

/// Build a `SessionState` for a terminal (completed/cancelled) response.
/// `row` is `None` when the session was already archived (timestamps unavailable).
fn terminal_session_state(
    session_id: String,
    status: &SessionStatus,
    row: Option<&db::SessionRow>,
) -> SessionState {
    let (created_at, expires_at) = match row {
        Some(r) => (unix_to_rfc3339(r.created_at), unix_to_rfc3339(r.expires_at)),
        None => (String::new(), String::new()),
    };
    SessionState {
        session_id,
        status: status.as_str().to_string(),
        current_round: 0,
        name: None,
        description: None,
        created_at,
        expires_at,
    }
}

/// Record a sessions_rejected_total metric with the given reason label.
/// DESIGN.md §2301 — reason distinguishes max_sessions / rate_limited / oom_guard.
fn record_rejected(reason: &str) {
    if let Some(m) = metrics() {
        m.sessions_rejected_total.add(
            1,
            &[opentelemetry::KeyValue::new("reason", reason.to_string())],
        );
    }
}

/// Health probe (no DB check).
#[utoipa::path(
    get,
    path = "/v1/healthz",
    tag = "health",
    responses(
        (status = 200, description = "Server is healthy", body = serde_json::Value)
    )
)]
pub async fn healthz() -> Json<serde_json::Value> {
    Json(serde_json::json!({"status": "ok"}))
}

/// Readiness probe (checks SQLite connection).
#[utoipa::path(
    get,
    path = "/v1/readyz",
    tag = "health",
    responses(
        (status = 200, description = "Server is ready", body = serde_json::Value),
        (status = 503, description = "Service unavailable")
    )
)]
pub async fn readyz(State(state): State<AppState>) -> Result<Json<serde_json::Value>, StatusCode> {
    match sqlx::query("SELECT 1").execute(&state.pool).await {
        Ok(_) => Ok(Json(serde_json::json!({"status": "ok"}))),
        Err(_) => Err(StatusCode::SERVICE_UNAVAILABLE),
    }
}
