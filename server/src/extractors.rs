//! Custom axum extractors for input validation.
//!
//! [`ValidatedJson`] deserializes a JSON body and runs garde validation before
//! the handler sees it. Both serde-deserialization failures and garde rule
//! failures surface as **400 Bad Request** (not axum's default 422): the design
//! reserves 422 exclusively for `Idempotency-Key` mismatch, so every other
//! "malformed input" outcome must be a 400. See `specs/validation.md`.
//!
//! [`RawJsonBody`] provides the raw request bytes while enforcing
//! `Content-Type: application/json` (returning 415 on mismatch, matching
//! axum's built-in `Json` extractor behaviour).

use axum::body::Bytes;
use axum::extract::{FromRequest, Request};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde::de::DeserializeOwned;

use crate::error::ApiError;

/// Extractor that deserializes JSON into `T` and validates it via garde.
///
/// Bound `T: DeserializeOwned + garde::Validate` with a `Default` context — use
/// this for DTOs whose validation is self-contained (e.g. `SessionUpdate`).
/// DTOs needing external context (e.g. `ResponseInput` whose validator needs a
/// `&Grilling` from the DB) are received as plain `Json<T>` and validated in the
/// handler via `value.validate_with(&ctx)`.
pub struct ValidatedJson<T>(pub T);

impl<S, T> FromRequest<S> for ValidatedJson<T>
where
    S: Send + Sync,
    T: DeserializeOwned + garde::Validate,
    <T as garde::Validate>::Context: Default,
{
    type Rejection = ApiError;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        let bytes = Bytes::from_request(req, state)
            .await
            .map_err(|_| ApiError::bad_request("invalid request body"))?;

        let value: T = serde_json::from_slice(&bytes)
            .map_err(|e| ApiError::bad_request(format!("invalid JSON: {e}")))?;

        value
            .validate()
            .map_err(|e| ApiError::bad_request(format!("validation failed: {e}")))?;

        Ok(ValidatedJson(value))
    }
}

/// Extractor that provides raw request bytes while enforcing
/// `Content-Type: application/json`.
///
/// Returns 415 (Unsupported Media Type) if the Content-Type header is missing
/// or does not contain `application/json` — matching the behaviour of axum's
/// built-in `Json` extractor. This is used by handlers that need both the raw
/// bytes (e.g. for hashing) and the parsed value.
pub struct RawJsonBody {
    pub bytes: Bytes,
    pub value: serde_json::Value,
}

impl<S: Send + Sync> FromRequest<S> for RawJsonBody {
    type Rejection = axum::response::Response;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        // Check Content-Type first — return 415 before consuming the body.
        let content_type = req
            .headers()
            .get(axum::http::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !content_type.contains("application/json") {
            let body = Json(serde_json::json!({
                "message": "expected Content-Type: application/json",
                "status": 415,
            }));
            return Err((StatusCode::UNSUPPORTED_MEDIA_TYPE, body).into_response());
        }

        let bytes = Bytes::from_request(req, state).await.map_err(|e| {
            let body = Json(serde_json::json!({
                "message": format!("failed to read request body: {e}"),
                "status": 400,
            }));
            (StatusCode::BAD_REQUEST, body).into_response()
        })?;

        let value: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| {
            let body = Json(serde_json::json!({
                "message": format!("invalid JSON: {e}"),
                "status": 400,
            }));
            (StatusCode::BAD_REQUEST, body).into_response()
        })?;

        Ok(RawJsonBody { bytes, value })
    }
}
