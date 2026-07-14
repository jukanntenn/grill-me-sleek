//! Custom axum extractors for input validation.
//!
//! [`ValidatedJson`] deserializes a JSON body and runs garde validation before
//! the handler sees it. Both serde-deserialization failures and garde rule
//! failures surface as **400 Bad Request** (not axum's default 422): the design
//! reserves 422 exclusively for `Idempotency-Key` mismatch, so every other
//! "malformed input" outcome must be a 400. See `specs/validation.md`.

use axum::body::Bytes;
use axum::extract::{FromRequest, Request};
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
            .map_err(|_| ApiError::BadRequest("invalid request body".to_string()))?;

        let value: T = serde_json::from_slice(&bytes)
            .map_err(|e| ApiError::BadRequest(format!("invalid JSON: {e}")))?;

        value
            .validate()
            .map_err(|e| ApiError::BadRequest(format!("validation failed: {e}")))?;

        Ok(ValidatedJson(value))
    }
}
