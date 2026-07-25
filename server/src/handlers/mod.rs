pub mod response;
pub mod rounds;
pub mod sessions;
pub mod sse;

use axum::http::{HeaderMap, StatusCode};
use axum::response::Json;
use std::net::{IpAddr, SocketAddr};

use crate::error::ApiError;
use crate::models::Grilling;

/// Extract client IP from `X-Forwarded-For` header, falling back to peer address.
///
/// Caddy sets `X-Forwarded-For` from `CF-Connecting-IP`, so we trust the first
/// entry. This mirrors `SmartIp`'s logic but is used for logging, not rate limiting.
pub(crate) fn extract_client_ip(headers: &HeaderMap, peer: &SocketAddr) -> IpAddr {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .and_then(|s| s.trim().parse::<IpAddr>().ok())
        .unwrap_or_else(|| peer.ip())
}

/// Extract the `Idempotency-Key` header value and compute the body hash
/// from the raw request bytes.
///
/// Computing the hash from the original bytes avoids re-serializing a
/// `serde_json::Value` (which was itself deserialized from those same bytes).
pub(crate) fn extract_idempotency(headers: &HeaderMap, raw_bytes: &[u8]) -> (Option<String>, u64) {
    let key = headers
        .get("Idempotency-Key")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let hash = crate::idempotency::hash_body(raw_bytes);
    (key, hash)
}

/// Validate a raw JSON value against the Grilling schema and extract
/// idempotency metadata in one pass.
///
/// Combines [`validation::validate_grilling_value`] and [`extract_idempotency`]
/// to avoid serializing the same `Value` twice — the body hash is computed from
/// the original request bytes, not from a re-serialization of the parsed value.
pub(crate) fn validate_and_extract(
    raw_bytes: &[u8],
    raw_value: &serde_json::Value,
    headers: &HeaderMap,
) -> Result<(Grilling, Option<String>, u64), ApiError> {
    let body = crate::validation::validate_grilling_value(raw_value)?;
    let (key, hash) = extract_idempotency(headers, raw_bytes);
    Ok((body, key, hash))
}

/// Build a [`RoundResponse`] from a DB round row.
pub(crate) fn build_round_response(
    row: &crate::db::RoundRow,
) -> Result<crate::models::RoundResponse, ApiError> {
    let grilling = crate::db::deserialize_grilling(&row.grilling)?;
    let response = crate::db::response_or_none(row.response.as_deref());
    Ok(crate::models::RoundResponse {
        round: row.seq,
        name: row.name.clone(),
        grilling,
        response,
    })
}

/// Deserialize an idempotent cache entry into a typed response.
///
/// Centralises the repeated `serde_json::from_str` + `StatusCode::from_u16`
/// pattern found in idempotent creation handlers.
pub(crate) fn deserialize_idempotent_response<T: serde::de::DeserializeOwned>(
    entry: &crate::idempotency::IdempotencyEntry,
) -> Result<(StatusCode, Json<T>), ApiError> {
    let response: T = serde_json::from_str(&entry.response_body)?;
    let status = StatusCode::from_u16(entry.status_code).unwrap_or(StatusCode::CREATED);
    Ok((status, Json(response)))
}
