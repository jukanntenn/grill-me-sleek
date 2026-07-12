use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

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

impl SessionStatus {
    pub fn from_i64(v: i64) -> Option<Self> {
        match v {
            0 => Some(Self::Active),
            1 => Some(Self::Completed),
            2 => Some(Self::Cancelled),
            3 => Some(Self::Expired),
            _ => None,
        }
    }
}

/// `TryFrom<i64>` per DESIGN.md §1262 spec (DB stores status as int).
impl std::convert::TryFrom<i64> for SessionStatus {
    type Error = ();

    fn try_from(v: i64) -> Result<Self, Self::Error> {
        Self::from_i64(v).ok_or(())
    }
}

/// Lowercase string representation as used in API responses.
impl SessionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Completed => "completed",
            Self::Cancelled => "cancelled",
            Self::Expired => "expired",
        }
    }
}

// ---------------------------------------------------------------------------
// Grilling (questionnaire payload from agent)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Grilling {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additional_notes: Option<AdditionalNotes>,
    pub questions: Vec<Question>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum QuestionType {
    Single,
    Multi,
    Text,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Variant {
    #[default]
    Default,
    Yesno,
    Rating,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionItem {
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

// ---------------------------------------------------------------------------
// Response (user answers)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Response {
    pub round: i64,
    pub answers: HashMap<String, Answer>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additional_notes: Option<String>,
    pub submitted_at: String, // RFC 3339
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Answer {
    pub selected: Value, // string for single/text, string[] for multi
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub custom_text: String,
}

// ---------------------------------------------------------------------------
// ResponseInput (POST /response request body)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponseInput {
    pub answers: HashMap<String, Answer>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additional_notes: Option<String>,
}

// ---------------------------------------------------------------------------
// SessionUpdate (PATCH /sessions request body)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionUpdate {
    pub status: SessionUpdateStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<CancelReason>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason_detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actor: Option<Actor>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SessionUpdateStatus {
    Completed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CancelReason {
    UserCancelled,
    AgentAborted,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Actor {
    User,
    Agent,
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct SessionState {
    pub session_id: String,
    pub status: String, // "active"
    pub current_round: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub created_at: String,  // RFC 3339
    pub expires_at: String,  // RFC 3339
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoundResponse {
    pub round: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub grilling: Grilling,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<Response>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RoundSummary {
    pub round: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub has_response: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct PendingResponse {
    pub status: String, // "pending"
}

#[derive(Debug, Clone, Serialize)]
pub struct GoneResponse {
    pub status: String, // "gone"
    pub detail: String, // "expired" | "completed" | "cancelled"
}

#[derive(Debug, Clone, Serialize)]
pub struct ConflictResponse {
    pub message: String,
    pub status: i64,
    pub round: i64,
    pub response: Response,
}

#[derive(Debug, Clone, Serialize)]
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
    pub grilling: String,  // raw JSON string
    pub response: Option<String>, // raw JSON string
    pub created_at: i64,
}

// NOTE: unit tests live in `tests.rs` (separate file) — no inline test module
// here to avoid duplicating the test surface.
#[cfg(test)]
mod tests;
