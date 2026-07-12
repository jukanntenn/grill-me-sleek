use axum::extract::{Path, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Json};

use crate::db;
use crate::error::ApiError;
use crate::idempotency::{self, IdempotencyEntry};
use crate::models::*;
use crate::observability::metrics::metrics;
use crate::session::time_now;
use crate::validation;
use crate::AppState;

/// GET /v1/sessions/{session_id}/rounds — List all rounds (summary).
pub async fn list_rounds(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> Result<Json<Vec<RoundSummary>>, ApiError> {
    // Verify session exists (any state)
    db::get_session(&state.pool, &session_id)
        .await?
        .ok_or(ApiError::NotFound)?;

    let rows = db::list_rounds(&state.pool, &session_id).await?;
    let summaries = rows
        .into_iter()
        .map(|r| RoundSummary {
            round: r.seq,
            name: r.name,
            has_response: r.has_response != 0,
        })
        .collect();

    Ok(Json(summaries))
}

/// POST /v1/sessions/{session_id}/rounds — Create a new round.
#[tracing::instrument(skip(state, raw, headers), fields(session_id = %session_id))]
pub async fn create_round(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    headers: HeaderMap,
    Json(raw): Json<serde_json::Value>,
) -> Result<(StatusCode, Json<RoundResponse>), ApiError> {
    // Validate Grilling (JSON Schema + question-id uniqueness). Receiving a raw
    // Value ensures schema violations return 400, not axum's 422 serde rejection.
    let body: Grilling = validation::validate_grilling_value(&raw)?;

    // Verify session is active
    let _row = db::get_session_or_gone(&state.pool, &session_id).await?;

    let idempotency_key = headers
        .get("Idempotency-Key")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let body_hash = idempotency::hash_body(&serde_json::to_vec(&raw).unwrap_or_default());

    // Idempotency key is scoped per-session: DESIGN.md §1479 — key dimension is
    // (session_id, key). We namespace it by prefixing with the session id.
    let cache_key = idempotency_key.map(|k| format!("{session_id}:{k}"));

    let state_for_create = state.clone();
    let session_id_for_create = session_id.clone();
    let create = move || async move {
        let now = time_now();
        let (new_seq, _round_id) =
            db::create_round(&state_for_create.pool, &session_id_for_create, &body, now).await?;

        let response = RoundResponse {
            round: new_seq,
            name: Some(body.name.clone()),
            grilling: body.clone(),
            response: None,
        };

        // Broadcast SSE event
        if let Some(handle) = state_for_create.handles.get(&session_id_for_create) {
            handle
                .sse_hub
                .broadcast(crate::sse::SseEvent::round_created(new_seq));
        }

        if let Some(m) = metrics() {
            m.rounds_created_total.add(1, &[]);
        }

        tracing::info!(
            session_id = %session_id_for_create,
            round = new_seq,
            "round created"
        );
        Ok(IdempotencyEntry {
            response_body: serde_json::to_string(&response).unwrap_or_default(),
            status_code: 201,
            body_hash,
        })
    };

    let entry =
        idempotency::run_idempotent(&state.idempotency_rounds, cache_key, body_hash, create).await?;

    let response: RoundResponse = serde_json::from_str(&entry.response_body)
        .map_err(|e| ApiError::internal(anyhow::anyhow!("failed to deserialize response: {e}")))?;
    Ok((
        StatusCode::from_u16(entry.status_code).unwrap_or(StatusCode::CREATED),
        Json(response),
    ))
}

/// GET /v1/sessions/{session_id}/rounds/current — Get current round.
pub async fn get_current_round(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> Result<Json<RoundResponse>, ApiError> {
    let _row = db::get_session_or_gone(&state.pool, &session_id).await?;

    let round = db::get_current_round(&state.pool, &session_id)
        .await?
        .ok_or(ApiError::NotFound)?;

    let grilling: Grilling = serde_json::from_str(&round.grilling).map_err(|e| {
        ApiError::internal(anyhow::anyhow!("failed to deserialize grilling: {e}"))
    })?;

    let response = round
        .response
        .as_ref()
        .and_then(|r| serde_json::from_str::<Response>(r).ok());

    Ok(Json(RoundResponse {
        round: round.seq,
        name: round.name,
        grilling,
        response,
    }))
}

/// GET /v1/sessions/{session_id}/rounds/{seq} — Get a specific round.
#[tracing::instrument(skip(state, headers), fields(session_id = %session_id, round = %seq))]
pub async fn get_round(
    State(state): State<AppState>,
    Path((session_id, seq)): Path<(String, i64)>,
    headers: HeaderMap,
) -> Result<axum::response::Response, ApiError> {
    let round = db::get_round(&state.pool, &session_id, seq)
        .await?
        .ok_or(ApiError::NotFound)?;

    // ETag check
    let etag = compute_etag(&round.grilling);
    if let Some(if_none_match) = headers.get("If-None-Match") {
        if let Ok(val) = if_none_match.to_str() {
            if etag_matches(val, &etag) {
                // 304: empty body + ETag header
                let mut resp = axum::response::Response::new(axum::body::Body::empty());
                *resp.status_mut() = StatusCode::NOT_MODIFIED;
                resp.headers_mut().insert(
                    axum::http::header::ETAG,
                    HeaderValue::from_str(&etag).unwrap(),
                );
                return Ok(resp);
            }
        }
    }

    let grilling: Grilling = serde_json::from_str(&round.grilling).map_err(|e| {
        ApiError::internal(anyhow::anyhow!("failed to deserialize grilling: {e}"))
    })?;

    let response = round
        .response
        .as_ref()
        .and_then(|r| serde_json::from_str::<Response>(r).ok());

    let body = RoundResponse {
        round: round.seq,
        name: round.name,
        grilling,
        response,
    };

    // 200: JSON body + ETag header
    let mut resp = Json(body).into_response();
    resp.headers_mut().insert(
        axum::http::header::ETAG,
        HeaderValue::from_str(&etag).unwrap(),
    );
    Ok(resp)
}

/// Compute weak ETag from grilling JSON bytes.
fn compute_etag(grilling_json: &str) -> String {
    let h = xxhash_rust::xxh3::xxh3_64(grilling_json.as_bytes());
    format!("W/\"{h:016x}\"")
}

/// Check if an If-None-Match value matches the current ETag.
/// Uses weak comparison per RFC 7232 §3.2.
fn etag_matches(if_none_match: &str, etag: &str) -> bool {
    // Strip W/ prefix for comparison (weak comparison)
    let clean_etag = etag.strip_prefix("W/").unwrap_or(etag);
    if_none_match
        .split(',')
        .any(|v| {
            let v = v.trim();
            v == etag || v == clean_etag || v.strip_prefix("W/").unwrap_or(v) == clean_etag
        })
}
