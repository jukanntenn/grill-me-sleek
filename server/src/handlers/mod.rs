pub mod response;
pub mod rounds;
pub mod sessions;
pub mod sse;

use axum::http::HeaderMap;
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

/// Deserialize a stored grilling JSON string into a [`Grilling`].
///
/// Thin wrapper over [`db::deserialize_grilling`] that maps to [`ApiError`].
pub(crate) fn deserialize_grilling(json: &str) -> Result<Grilling, ApiError> {
    crate::db::deserialize_grilling(json).map_err(ApiError::internal)
}

/// Extract the `Idempotency-Key` header value and compute the body hash.
///
/// Centralises the repeated header extraction + body-hash computation found in
/// `create_session` and `create_round` handlers.
pub(crate) fn extract_idempotency(
    headers: &HeaderMap,
    raw: &serde_json::Value,
) -> (Option<String>, u64) {
    let key = headers
        .get("Idempotency-Key")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let hash = crate::idempotency::hash_body(
        &serde_json::to_vec(raw)
            .expect("serde_json::Value serialization must succeed; this is a programming bug"),
    );
    (key, hash)
}

/// Build a [`RoundResponse`] from a DB round row.
pub(crate) fn build_round_response(
    row: &crate::db::RoundRow,
) -> Result<crate::models::RoundResponse, ApiError> {
    let grilling = deserialize_grilling(&row.grilling)?;
    let response = crate::db::response_or_none(row.response.as_deref());
    Ok(crate::models::RoundResponse {
        round: row.seq,
        name: row.name.clone(),
        grilling,
        response,
    })
}
