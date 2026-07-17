//! Shared request validation: Grilling JSON Schema + question-id uniqueness.
//!
//! Both POST /sessions and POST /rounds accept a Grilling payload and run the
//! same validation pipeline:
//!   1. JSON Schema (draft 2020-12) via the `jsonschema` crate (covers allOf /
//!      if-then conditions: single(default/rating) requires options, multi
//!      requires options, single(yesno) is exempt).
//!   2. Question-id uniqueness within the round (not expressible in JSON Schema;
//!      `uniqueItems` compares deep equality and misses same-id/different-body).
//!
//! DESIGN.md §1771 — schema is `include_str!`-compiled into the binary; the
//! `Validator` is a process-wide singleton via `OnceLock` (`Validator: Send + Sync`).

use jsonschema::Validator;
use std::sync::OnceLock;

use crate::error::ApiError;
use crate::models::{Grilling, QuestionType, ResponseInput};

static GRILLING_VALIDATOR: OnceLock<Validator> = OnceLock::new();

/// 进程级 Grilling JSON Schema 校验器（懒加载，仅编译一次）。
/// schema 经 `include_str!` 编入二进制；解析/编译失败属不可恢复的构建期 bug，
/// 故用 `expect`（符合 M-PANIC-ON-BUG：编程错误 → panic）。
fn grilling_validator() -> &'static Validator {
    GRILLING_VALIDATOR.get_or_init(|| {
        let schema: serde_json::Value =
            serde_json::from_str(include_str!("../schemas/grilling.json"))
                .expect("invalid grilling schema");
        jsonschema::validator_for(&schema).expect("failed to compile grilling schema")
    })
}

/// Validate a raw JSON value against the Grilling JSON Schema, then deserialize
/// it into a `Grilling` and check question-id uniqueness.
///
/// Accepting a `serde_json::Value` (rather than `Json<Grilling>` at the extractor
/// layer) ensures schema violations return 400 from the handler's authoritative
/// jsonschema check — instead of axum's default 422 serde-rejection, which the
/// design reserves for Idempotency-Key mismatch (DESIGN.md §589).
pub fn validate_grilling_value(value: &serde_json::Value) -> Result<Grilling, ApiError> {
    let validator = grilling_validator();

    if let Err(e) = validator.validate(value) {
        return Err(ApiError::BadRequest(format!(
            "grilling validation failed: {e}"
        )));
    }

    let grilling: Grilling = serde_json::from_value(value.clone())
        .map_err(|e| ApiError::BadRequest(format!("failed to deserialize grilling: {e}")))?;

    validate_unique_question_ids(&grilling)?;
    Ok(grilling)
}

/// Validate a Grilling payload against the JSON Schema + question-id uniqueness.
/// (Convenience for already-deserialized payloads.)
pub fn validate_grilling(grilling: &Grilling) -> Result<(), ApiError> {
    let value = serde_json::to_value(grilling)
        .map_err(|e| ApiError::BadRequest(format!("failed to serialize grilling: {e}")))?;
    let validator = grilling_validator();
    if let Err(e) = validator.validate(&value) {
        return Err(ApiError::BadRequest(format!(
            "grilling validation failed: {e}"
        )));
    }
    validate_unique_question_ids(grilling)
}

/// Validate that all question IDs are unique within a Grilling round.
/// JSON Schema `uniqueItems` only catches deep-equal duplicates; it misses
/// "same id, different body". Here we dedupe on the `id` field directly.
pub fn validate_unique_question_ids(grilling: &Grilling) -> Result<(), ApiError> {
    let mut seen = std::collections::HashSet::new();
    for q in &grilling.questions {
        if !seen.insert(&q.id) {
            return Err(ApiError::BadRequest(format!(
                "duplicate question id: {}",
                q.id
            )));
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// ResponseInput cross-field validation (garde struct-level custom)
// ---------------------------------------------------------------------------

/// Garde struct-level custom validator for [`ResponseInput`].
///
/// Runs in the handler after the persisted [`Grilling`] is fetched from the DB
/// (the validator's context). Enforces the cross-field rules that neither a
/// static JSON Schema nor a self-contained garde derive can express:
///   - each answer's `selected` shape matches the corresponding question type
///     (single/text → string; multi → array);
///   - text questions honour their `max_length`;
///   - multi + required → at least one option selected;
///   - required questions must have an answer;
///   - the global `additional_notes` box honours its required/max_length config.
pub fn validate_response_input(
    input: &ResponseInput,
    grilling: &Grilling,
) -> Result<(), garde::Error> {
    for q in &grilling.questions {
        if let Some(answer) = input.answers.get(&q.id) {
            // Validate selected type matches question type
            match q.question_type {
                QuestionType::Single | QuestionType::Text => {
                    if !answer.selected.is_string() {
                        return Err(garde::Error::new(format!(
                            "question '{}': selected must be a string for {:?} type",
                            q.id, q.question_type
                        )));
                    }
                    // Max length check for text
                    if q.question_type == QuestionType::Text {
                        if let Some(max_len) = q.max_length {
                            if let Some(s) = answer.selected.as_str() {
                                if s.len() as i64 > max_len {
                                    return Err(garde::Error::new(format!(
                                        "question '{}': selected exceeds max_length {max_len}",
                                        q.id
                                    )));
                                }
                            }
                        }
                    }
                }
                QuestionType::Multi => {
                    if !answer.selected.is_array() {
                        return Err(garde::Error::new(format!(
                            "question '{}': selected must be an array for multi type",
                            q.id
                        )));
                    }
                    if q.required {
                        if let Some(arr) = answer.selected.as_array() {
                            if arr.is_empty() {
                                return Err(garde::Error::new(format!(
                                    "question '{}': at least one option must be selected",
                                    q.id
                                )));
                            }
                        }
                    }
                }
            }
        } else if q.required {
            return Err(garde::Error::new(format!(
                "question '{}': missing required answer",
                q.id
            )));
        }
    }

    // Validate additional_notes
    if let Some(notes_config) = &grilling.additional_notes {
        match &input.additional_notes {
            None => {
                if notes_config.required {
                    return Err(garde::Error::new(
                        "additional_notes is required".to_string(),
                    ));
                }
            }
            Some(notes) => {
                if let Some(max_len) = notes_config.max_length {
                    if notes.len() as i64 > max_len {
                        return Err(garde::Error::new(format!(
                            "additional_notes exceeds max_length {max_len}"
                        )));
                    }
                }
                if notes_config.required && notes.trim().is_empty() {
                    return Err(garde::Error::new(
                        "additional_notes is required".to_string(),
                    ));
                }
            }
        }
    }

    Ok(())
}
