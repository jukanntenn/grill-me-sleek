pub mod response;
pub mod rounds;
pub mod sessions;
pub mod sse;

use crate::error::ApiError;
use crate::models::Grilling;

/// Deserialize a stored grilling JSON string into a [`Grilling`].
///
/// Centralises the repeated `serde_json::from_str` + error wrapping found in
/// round/response handlers.
pub(crate) fn deserialize_grilling(json: &str) -> Result<Grilling, ApiError> {
    serde_json::from_str(json)
        .map_err(|e| ApiError::internal(anyhow::anyhow!("failed to deserialize grilling: {e}")))
}
