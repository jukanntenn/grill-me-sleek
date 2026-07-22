use axum::extract::{ConnectInfo, FromRequestParts, Path, State};
use axum::http::{HeaderMap, StatusCode, request::Parts};
use axum::response::Json;
use std::net::SocketAddr;

use crate::AppState;
use crate::db;
use crate::error::ApiError;
use crate::extractors::ValidatedJson;
use crate::idempotency::{self, IdempotencyEntry};
use crate::models::{
    CreateSessionResponse, ErrorResponse, GoneResponse, Grilling, SessionState, SessionStatus,
    SessionUpdate, SessionUpdateStatus,
};
use crate::observability::metrics::{metrics, record_session_created};
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
    let client_ip = super::extract_client_ip(&headers, &peer);

    // Validate Grilling (JSON Schema + question-id uniqueness). Receiving a raw
    // Value (not Json<Grilling>) ensures schema violations return 400 from our
    // authoritative jsonschema check, rather than axum's 422 serde rejection.
    let body: Grilling = validation::validate_grilling_value(&raw)?;

    let (idempotency_key, body_hash) = super::extract_idempotency(&headers, &raw);

    // The creation closure: generates an ID, writes the session+first round,
    // registers the SessionHandle, and builds the response entry. Under an
    // idempotency key, moka's `try_get_with` coalesces concurrent calls into a
    // single evaluation of this closure (DESIGN.md §1481).
    let state_for_create = state.clone();
    let create = move || async move {
        // Check session capacity
        if state_for_create.handles.len() >= session::MAX_SESSIONS {
            if let Some(m) = metrics() {
                m.sessions_rejected_total.add(
                    1,
                    &[opentelemetry::KeyValue::new(
                        "reason",
                        "max_sessions".to_string(),
                    )],
                );
            }
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
                        if let Some(m) = metrics() {
                            m.sessions_rejected_total.add(
                                1,
                                &[opentelemetry::KeyValue::new(
                                    "reason",
                                    "max_sessions".to_string(),
                                )],
                            );
                        }
                        return Err(ApiError::MaxSessions);
                    }

                    let url = format!("{}/#{session_id}", state_for_create.base_url);
                    // Extract fields before they are consumed by the response
                    let name = body.name;
                    let description = body.description;

                    let response = CreateSessionResponse {
                        session_id: session_id.clone(),
                        url,
                        status: "active".to_string(),
                        current_round: 1,
                        name: Some(name),
                        description,
                        created_at: unix_to_rfc3339(now),
                        expires_at: unix_to_rfc3339(expires_at),
                    };

                    record_session_created();

                    tracing::info!(session_id = %session_id, client_ip = %client_ip, "session created");
                    return Ok(IdempotencyEntry {
                        response_body: serde_json::to_string(&response).unwrap_or_default().into(),
                        status_code: 201,
                        body_hash,
                    });
                }
                Err(e) => {
                    if let Some(sqlx::Error::Database(db_err)) = e.downcast_ref::<sqlx::Error>() {
                        // SQLite extended result code 197 = SQLITE_CONSTRAINT_PRIMARYKEY
                        if db_err
                            .code()
                            .is_some_and(|c| c == crate::db::SQLITE_CONSTRAINT_PRIMARYKEY)
                            && attempt < 2
                        {
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

    let response: CreateSessionResponse = serde_json::from_str(&entry.response_body)?;
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
                let desc = super::deserialize_grilling(&r.grilling)
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
        status: SessionStatus::Active,
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
    let desired_status: SessionStatus = body.status.into();

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

    let current_status = SessionStatus::try_from(row.status).unwrap_or(SessionStatus::Expired);
    if current_status.is_terminal() {
        // Idempotent: already in the desired terminal state → return success.
        if current_status == desired_status {
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
        SessionUpdateStatus::Cancelled => (
            body.reason.map(|r| r.to_string()),
            body.reason_detail,
            body.actor.map(|a| a.to_string()),
        ),
    };

    // Update session status
    let affected = db::update_session_status(
        &state.pool,
        &session_id,
        desired_status,
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

    // Archive the session (must happen before cancel_token.cancel() so the
    // long-poll handler can query the DB and find the terminal state).
    db::archive_session(&state.pool, &session_id, desired_status, now).await?;

    // Broadcast terminal SSE event before removing the handle (remove_session
    // cancels the token, which wakes long-poll handlers).
    if let Some(handle) = state.handles.get(&session_id) {
        let event = match desired_status {
            SessionStatus::Completed => crate::sse::SseEvent::session_completed(&session_id),
            SessionStatus::Cancelled => crate::sse::SseEvent::session_cancelled(
                &session_id,
                cancel_reason.as_deref().unwrap_or("unknown"),
            ),
            _ => unreachable!(),
        };
        handle.sse_hub.broadcast(event);
    }

    // Remove handle + decrement ACTIVE_SESSIONS gauge (single responsibility).
    session::remove_session(&state.handles, &session_id);

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
        status: *status,
        current_round: 0,
        name: None,
        description: None,
        created_at,
        expires_at,
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
