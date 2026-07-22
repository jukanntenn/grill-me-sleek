use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use std::sync::Arc;

use crate::models::{ConflictResponse, ErrorResponse, Response as ResponseModel};

/// Unified API error type. Each variant maps to a specific HTTP status code
/// and the `{message, status}` response body.
///
/// `Clone` is supported so that idempotency dedup (moka `try_get_with`) can
/// surface the same error to every concurrent waiter. The internal variant
/// holds an `Arc<anyhow::Error>` to keep cloning cheap.
#[derive(Debug, Clone, thiserror::Error)]
pub enum ApiError {
    #[error("{0}")]
    BadRequest(String), // 400

    #[error("session not found")]
    NotFound, // 404

    #[error("session gone")]
    Gone {
        detail: String, // "expired" | "completed" | "cancelled"
    }, // 410

    #[error("session is in terminal state")]
    TerminalState, // 409 (no round/response in body)

    #[error("round already submitted")]
    RoundAlreadySubmitted { round: i64, response: ResponseModel }, // 409 (with round+response in body)

    #[error("idempotency key reused with different body")]
    IdempotencyMismatch, // 422

    #[error("max sessions reached")]
    MaxSessions, // 503

    #[error(transparent)]
    Internal(Arc<anyhow::Error>), // 500 (includes DB errors via ?)
}

impl ApiError {
    /// Convenience constructor wrapping an `anyhow::Error` in the Internal variant.
    pub fn internal(err: anyhow::Error) -> Self {
        ApiError::Internal(Arc::new(err))
    }

    /// Map each variant to its HTTP status code.
    fn status_code(&self) -> StatusCode {
        match self {
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::Gone { .. } => StatusCode::GONE,
            Self::TerminalState => StatusCode::CONFLICT,
            Self::RoundAlreadySubmitted { .. } => StatusCode::CONFLICT,
            Self::IdempotencyMismatch => StatusCode::UNPROCESSABLE_ENTITY,
            Self::MaxSessions => StatusCode::SERVICE_UNAVAILABLE,
            Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

/// Allow `?` on `anyhow::Error` / `Result<_, anyhow::Error>` to produce
/// `ApiError::Internal(Arc<anyhow::Error>)`. (`#[from] anyhow::Error` on the
/// Arc variant does not by itself enable `From<anyhow::Error>` because Arc
/// has its own `From`.)
impl From<anyhow::Error> for ApiError {
    fn from(err: anyhow::Error) -> Self {
        ApiError::Internal(Arc::new(err))
    }
}

/// Allow `?` on `sqlx::Error` → ApiError::Internal. DESIGN.md §168: DB errors
/// other than recognised constraint conflicts are folded into Internal.
impl From<sqlx::Error> for ApiError {
    fn from(err: sqlx::Error) -> Self {
        ApiError::Internal(Arc::new(err.into()))
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status_code();

        match &self {
            // Variants with custom message or body structure — keep explicit.
            ApiError::BadRequest(msg) => (
                status,
                Json(ErrorResponse {
                    message: msg.clone(),
                    status: status.as_u16() as i64,
                }),
            )
                .into_response(),

            ApiError::Gone { detail } => (
                StatusCode::GONE,
                Json(serde_json::json!({
                    "status": "gone",
                    "detail": detail,
                })),
            )
                .into_response(),

            ApiError::RoundAlreadySubmitted { round, response } => (
                StatusCode::CONFLICT,
                Json(ConflictResponse {
                    message: self.to_string(),
                    status: status.as_u16() as i64,
                    round: *round,
                    response: response.clone(),
                }),
            )
                .into_response(),

            // Variants using standard ErrorResponse — delegate to Display.
            ApiError::NotFound
            | ApiError::TerminalState
            | ApiError::IdempotencyMismatch
            | ApiError::MaxSessions => (
                status,
                Json(ErrorResponse {
                    message: self.to_string(),
                    status: status.as_u16() as i64,
                }),
            )
                .into_response(),

            ApiError::Internal(err) => {
                tracing::error!(error = %err, "internal error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        message: self.to_string(),
                        status: status.as_u16() as i64,
                    }),
                )
                    .into_response()
            }
        }
    }
}
