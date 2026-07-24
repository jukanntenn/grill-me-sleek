use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use std::backtrace::Backtrace;
use std::sync::Arc;

use crate::models::{ConflictResponse, ErrorResponse, Response as ResponseModel};

/// Unified API error type. Each variant maps to a specific HTTP status code
/// and the `{message, status}` response body.
///
/// `Clone` is supported so that idempotency dedup (moka `try_get_with`) can
/// surface the same error to every concurrent waiter. The internal variant
/// holds an `Arc<anyhow::Error>` to keep cloning cheap.
///
/// Each variant (except `Internal`) carries a [`Backtrace`] captured at creation
/// time. Backtrace capture is controlled by the `RUST_BACKTRACE` environment
/// variable — when unset, `Backtrace::capture()` returns an empty trace with
/// negligible overhead (~2 CPU instructions).
pub enum ApiError {
    BadRequest(String, Backtrace), // 400

    NotFound(Backtrace), // 404

    Gone {
        detail: String, // "expired" | "completed" | "cancelled"
        backtrace: Backtrace,
    }, // 410

    TerminalState(Backtrace), // 409 (no round/response in body)

    RoundAlreadySubmitted(Box<RoundAlreadySubmittedInner>), // 409 (with round+response in body)

    IdempotencyMismatch(Backtrace), // 422

    MaxSessions(Backtrace), // 503

    Internal(Arc<anyhow::Error>), // 500 (anyhow captures its own backtrace)
}

/// Inner data for `RoundAlreadySubmitted` — boxed to keep `ApiError` small.
pub struct RoundAlreadySubmittedInner {
    pub round: i64,
    pub response: ResponseModel,
    pub backtrace: Backtrace,
}

impl std::fmt::Debug for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::BadRequest(msg, bt) => f.debug_tuple("BadRequest").field(msg).field(bt).finish(),
            Self::NotFound(bt) => f.debug_tuple("NotFound").field(bt).finish(),
            Self::Gone { detail, backtrace } => f
                .debug_struct("Gone")
                .field("detail", detail)
                .field("backtrace", backtrace)
                .finish(),
            Self::TerminalState(bt) => f.debug_tuple("TerminalState").field(bt).finish(),
            Self::RoundAlreadySubmitted(inner) => f
                .debug_struct("RoundAlreadySubmitted")
                .field("round", &inner.round)
                .field("response", &inner.response)
                .field("backtrace", &inner.backtrace)
                .finish(),
            Self::IdempotencyMismatch(bt) => {
                f.debug_tuple("IdempotencyMismatch").field(bt).finish()
            }
            Self::MaxSessions(bt) => f.debug_tuple("MaxSessions").field(bt).finish(),
            Self::Internal(err) => f.debug_tuple("Internal").field(err).finish(),
        }
    }
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::BadRequest(msg, _) => write!(f, "{msg}"),
            Self::NotFound(_) => write!(f, "session not found"),
            Self::Gone { detail, .. } => write!(f, "session gone: {detail}"),
            Self::TerminalState(_) => write!(f, "session is in terminal state"),
            Self::RoundAlreadySubmitted(inner) => {
                write!(f, "round {} already submitted", inner.round)
            }
            Self::IdempotencyMismatch(_) => write!(f, "idempotency key reused with different body"),
            Self::MaxSessions(_) => write!(f, "max sessions reached"),
            Self::Internal(err) => write!(f, "{err}"),
        }
    }
}

impl std::error::Error for ApiError {
    // anyhow::Error captures its own error chain; no need to expose it via source().
}

// Manual Clone: Backtrace does not implement Clone, but it is cheap to capture
// a fresh one — the clone represents "same error, new trace snapshot".
impl Clone for ApiError {
    fn clone(&self) -> Self {
        match self {
            Self::BadRequest(msg, _) => Self::BadRequest(msg.clone(), Backtrace::capture()),
            Self::NotFound(_) => Self::NotFound(Backtrace::capture()),
            Self::Gone { detail, .. } => Self::Gone {
                detail: detail.clone(),
                backtrace: Backtrace::capture(),
            },
            Self::TerminalState(_) => Self::TerminalState(Backtrace::capture()),
            Self::RoundAlreadySubmitted(inner) => {
                Self::RoundAlreadySubmitted(Box::new(RoundAlreadySubmittedInner {
                    round: inner.round,
                    response: inner.response.clone(),
                    backtrace: Backtrace::capture(),
                }))
            }
            Self::IdempotencyMismatch(_) => Self::IdempotencyMismatch(Backtrace::capture()),
            Self::MaxSessions(_) => Self::MaxSessions(Backtrace::capture()),
            Self::Internal(e) => Self::Internal(e.clone()),
        }
    }
}

impl ApiError {
    /// Convenience constructor wrapping an `anyhow::Error` in the Internal variant.
    pub fn internal(err: anyhow::Error) -> Self {
        ApiError::Internal(Arc::new(err))
    }

    /// Create a BadRequest error with backtrace.
    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self::BadRequest(msg.into(), Backtrace::capture())
    }

    /// Create a NotFound error with backtrace.
    pub fn not_found() -> Self {
        Self::NotFound(Backtrace::capture())
    }

    /// Create a Gone error with backtrace.
    pub fn gone(detail: impl Into<String>) -> Self {
        Self::Gone {
            detail: detail.into(),
            backtrace: Backtrace::capture(),
        }
    }

    /// Create a TerminalState error with backtrace.
    pub fn terminal_state() -> Self {
        Self::TerminalState(Backtrace::capture())
    }

    /// Create a RoundAlreadySubmitted error with backtrace.
    pub fn round_already_submitted(round: i64, response: ResponseModel) -> Self {
        Self::RoundAlreadySubmitted(Box::new(RoundAlreadySubmittedInner {
            round,
            response,
            backtrace: Backtrace::capture(),
        }))
    }

    /// Create an IdempotencyMismatch error with backtrace.
    pub fn idempotency_mismatch() -> Self {
        Self::IdempotencyMismatch(Backtrace::capture())
    }

    /// Create a MaxSessions error with backtrace.
    pub fn max_sessions() -> Self {
        Self::MaxSessions(Backtrace::capture())
    }

    /// Get the backtrace from this error, if available.
    ///
    /// Returns `None` for `Internal` variants (anyhow captures its own backtrace).
    pub fn backtrace(&self) -> Option<&Backtrace> {
        match self {
            Self::BadRequest(_, bt) => Some(bt),
            Self::NotFound(bt) => Some(bt),
            Self::Gone { backtrace, .. } => Some(backtrace),
            Self::TerminalState(bt) => Some(bt),
            Self::RoundAlreadySubmitted(inner) => Some(&inner.backtrace),
            Self::IdempotencyMismatch(bt) => Some(bt),
            Self::MaxSessions(bt) => Some(bt),
            Self::Internal(_) => None,
        }
    }

    /// Map each variant to its HTTP status code.
    fn status_code(&self) -> StatusCode {
        match self {
            Self::BadRequest(_, _) => StatusCode::BAD_REQUEST,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Gone { .. } => StatusCode::GONE,
            Self::TerminalState(_) => StatusCode::CONFLICT,
            Self::RoundAlreadySubmitted(_) => StatusCode::CONFLICT,
            Self::IdempotencyMismatch(_) => StatusCode::UNPROCESSABLE_ENTITY,
            Self::MaxSessions(_) => StatusCode::SERVICE_UNAVAILABLE,
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

/// Allow `?` on `serde_json::Error` → ApiError::Internal.
impl From<serde_json::Error> for ApiError {
    fn from(err: serde_json::Error) -> Self {
        ApiError::Internal(Arc::new(err.into()))
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status_code();

        match &self {
            // Variants with custom message or body structure — keep explicit.
            ApiError::BadRequest(msg, _) => (
                status,
                Json(ErrorResponse {
                    message: msg.clone(),
                    status: status.as_u16() as i64,
                }),
            )
                .into_response(),

            ApiError::Gone { detail, .. } => (
                status,
                Json(serde_json::json!({
                    "status": "gone",
                    "detail": detail,
                })),
            )
                .into_response(),

            ApiError::RoundAlreadySubmitted(inner) => (
                StatusCode::CONFLICT,
                Json(ConflictResponse {
                    message: format!("round {} already submitted", inner.round),
                    status: status.as_u16() as i64,
                    round: inner.round,
                    response: inner.response.clone(),
                }),
            )
                .into_response(),

            // Variants using standard ErrorResponse — delegate to Display.
            ApiError::NotFound(_)
            | ApiError::TerminalState(_)
            | ApiError::IdempotencyMismatch(_)
            | ApiError::MaxSessions(_) => (
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
                    status,
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
