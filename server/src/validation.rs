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
use crate::models::Grilling;

static GRILLING_VALIDATOR: OnceLock<Validator> = OnceLock::new();

/// Validate a raw JSON value against the Grilling JSON Schema, then deserialize
/// it into a `Grilling` and check question-id uniqueness.
///
/// Accepting a `serde_json::Value` (rather than `Json<Grilling>` at the extractor
/// layer) ensures schema violations return 400 from the handler's authoritative
/// jsonschema check — instead of axum's default 422 serde-rejection, which the
/// design reserves for Idempotency-Key mismatch (DESIGN.md §589).
pub fn validate_grilling_value(value: &serde_json::Value) -> Result<Grilling, ApiError> {
    let validator = GRILLING_VALIDATOR.get_or_init(|| {
        let schema_str = include_str!("../schemas/grilling.json");
        let schema: serde_json::Value =
            serde_json::from_str(schema_str).expect("invalid grilling schema");
        jsonschema::validator_for(&schema).expect("failed to compile grilling schema")
    });

    if let Err(e) = validator.validate(value) {
        return Err(ApiError::BadRequest(format!(
            "grilling validation failed: {e}"
        )));
    }

    let grilling: Grilling = serde_json::from_value(value.clone()).map_err(|e| {
        ApiError::BadRequest(format!("failed to deserialize grilling: {e}"))
    })?;

    validate_unique_question_ids(&grilling)?;
    Ok(grilling)
}

/// Validate a Grilling payload against the JSON Schema + question-id uniqueness.
/// (Convenience for already-deserialized payloads.)
pub fn validate_grilling(grilling: &Grilling) -> Result<(), ApiError> {
    let value = serde_json::to_value(grilling)
        .map_err(|e| ApiError::BadRequest(format!("failed to serialize grilling: {e}")))?;
    let validator = GRILLING_VALIDATOR.get_or_init(|| {
        let schema_str = include_str!("../schemas/grilling.json");
        let schema: serde_json::Value =
            serde_json::from_str(schema_str).expect("invalid grilling schema");
        jsonschema::validator_for(&schema).expect("failed to compile grilling schema")
    });
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
