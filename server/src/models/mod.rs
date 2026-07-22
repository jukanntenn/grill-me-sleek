use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use utoipa::ToSchema;

// ---------------------------------------------------------------------------
// Session status
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(i64)]
pub enum SessionStatus {
    Active = 0,
    Completed = 1,
    Cancelled = 2,
    Expired = 3,
}

/// `TryFrom<i64>` per DESIGN.md §1262 spec (DB stores status as int).
impl TryFrom<i64> for SessionStatus {
    type Error = ();

    fn try_from(v: i64) -> Result<Self, Self::Error> {
        match v {
            0 => Ok(Self::Active),
            1 => Ok(Self::Completed),
            2 => Ok(Self::Cancelled),
            3 => Ok(Self::Expired),
            _ => Err(()),
        }
    }
}

impl std::fmt::Display for SessionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl SessionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Completed => "completed",
            Self::Cancelled => "cancelled",
            Self::Expired => "expired",
        }
    }

    /// Terminal state detail string for `Gone` responses.
    /// Returns `"unknown"` for `Active` (should not appear in terminal paths).
    pub fn terminal_detail(&self) -> &'static str {
        match self {
            Self::Completed => "completed",
            Self::Cancelled => "cancelled",
            Self::Expired => "expired",
            Self::Active => "unknown",
        }
    }
}

// ---------------------------------------------------------------------------
// Grilling (questionnaire payload from agent)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Grilling {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additional_notes: Option<AdditionalNotes>,
    pub questions: Vec<Question>,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct AdditionalNotes {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_length: Option<i64>,
    #[serde(default)]
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Question {
    pub id: String,
    pub header: String,
    pub text: String,
    #[serde(rename = "type")]
    pub question_type: QuestionType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<OptionItem>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recommended: Option<i64>,
    #[serde(default)]
    pub variant: Variant,
    #[serde(default = "default_rating_max")]
    pub rating_max: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_length: Option<i64>,
    #[serde(default = "default_true")]
    pub required: bool,
    #[serde(default = "default_true")]
    pub allow_custom_text: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
}

fn default_rating_max() -> i64 {
    5
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum QuestionType {
    Single,
    Multi,
    Text,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum Variant {
    #[default]
    Default,
    Yesno,
    Rating,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct OptionItem {
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

// ---------------------------------------------------------------------------
// Response (user answers)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Response {
    pub round: i64,
    pub answers: HashMap<String, Answer>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additional_notes: Option<String>,
    pub submitted_at: String, // RFC 3339
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct Answer {
    pub selected: Value, // string for single/text, string[] for multi
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub custom_text: String,
}

// ---------------------------------------------------------------------------
// ResponseInput (POST /response request body)
// ---------------------------------------------------------------------------

/// Cross-field validation requires the persisted [`Grilling`] (to know each
/// question's type / required flag / max_length). That context is fetched from
/// the DB at request time, so the extractor cannot supply it — validation runs
/// in the handler via `validate_with(&grilling)`.
#[derive(Debug, Clone, Serialize, Deserialize, garde::Validate, ToSchema)]
#[garde(context(Grilling))]
#[garde(custom(crate::validation::validate_response_input))]
pub struct ResponseInput {
    #[garde(skip)]
    pub answers: HashMap<String, Answer>,
    #[garde(skip)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additional_notes: Option<String>,
}

// ---------------------------------------------------------------------------
// SessionUpdate (PATCH /sessions request body)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, garde::Validate, ToSchema)]
pub struct SessionUpdate {
    #[garde(skip)]
    pub status: SessionUpdateStatus,
    #[garde(skip)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<CancelReason>,
    #[garde(skip)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason_detail: Option<String>,
    #[garde(skip)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actor: Option<Actor>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum SessionUpdateStatus {
    Completed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum CancelReason {
    UserCancelled,
    AgentAborted,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum Actor {
    User,
    Agent,
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SessionState {
    pub session_id: String,
    pub status: String, // "active"
    pub current_round: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub created_at: String, // RFC 3339
    pub expires_at: String, // RFC 3339
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct CreateSessionResponse {
    pub session_id: String,
    pub url: String,
    pub status: String,
    pub current_round: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub created_at: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct RoundResponse {
    pub round: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub grilling: Grilling,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<Response>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct RoundSummary {
    pub round: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub has_response: bool,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct PendingResponse {
    pub status: String, // "pending"
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct GoneResponse {
    pub status: String, // "gone"
    pub detail: String, // "expired" | "completed" | "cancelled"
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ConflictResponse {
    pub message: String,
    pub status: i64,
    pub round: i64,
    pub response: Response,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ErrorResponse {
    pub message: String,
    pub status: i64,
}

// ---------------------------------------------------------------------------
// Archive snapshot
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveSnapshot {
    pub rounds: Vec<ArchiveRound>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveRound {
    pub seq: i64,
    pub name: Option<String>,
    pub grilling: String,         // raw JSON string
    pub response: Option<String>, // raw JSON string
    pub created_at: i64,
}

// ---------------------------------------------------------------------------
// DB row types — used by `db` module queries and returned to handlers.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SessionRow {
    pub id: String,
    pub status: i64,
    pub curr_round: Option<i64>,
    pub name: Option<String>,
    pub created_at: i64,
    pub expires_at: i64,
    pub cancel_reason: Option<String>,
    pub cancel_detail: Option<String>,
    pub cancel_actor: Option<String>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct RoundRow {
    pub id: i64,
    pub session_id: String,
    pub seq: i64,
    pub name: Option<String>,
    pub grilling: String,
    pub response: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct RoundSummaryRow {
    pub seq: i64,
    pub name: Option<String>,
    // SQLite booleans are INTEGER (0/1); the handler converts to bool.
    pub has_response: i64,
}

// NOTE: unit tests live in `tests.rs` (separate file) — no inline test module
// here to avoid duplicating the test surface.
#[cfg(test)]
mod tests;
