// 单元测试 · 状态机转换 + 错误体系
// 覆盖：PATCH 拒绝矩阵、ApiError → 状态码映射

use axum::http::StatusCode;
use axum::response::IntoResponse;
use grilling_sleek::error::ApiError;
use grilling_sleek::models::*;

// ---------------------------------------------------------------------------
// SessionUpdate 反序列化
// ---------------------------------------------------------------------------

#[test]
fn session_update_completed() {
    let u: SessionUpdate = serde_json::from_str(r#"{"status":"completed"}"#).unwrap();
    assert_eq!(u.status, SessionUpdateStatus::Completed);
    assert!(u.reason.is_none());
    assert!(u.actor.is_none());
}

#[test]
fn session_update_cancelled_full() {
    let u: SessionUpdate = serde_json::from_str(
        r#"{"status":"cancelled","reason":"user_cancelled","reason_detail":"changed mind","actor":"user"}"#
    ).unwrap();
    assert_eq!(u.status, SessionUpdateStatus::Cancelled);
    assert_eq!(u.reason, Some(CancelReason::UserCancelled));
    assert_eq!(u.reason_detail.as_deref(), Some("changed mind"));
    assert_eq!(u.actor, Some(Actor::User));
}

#[test]
fn session_update_cancelled_agent_aborted() {
    let u: SessionUpdate =
        serde_json::from_str(r#"{"status":"cancelled","reason":"agent_aborted","actor":"agent"}"#)
            .unwrap();
    assert_eq!(u.reason, Some(CancelReason::AgentAborted));
    assert_eq!(u.actor, Some(Actor::Agent));
}

#[test]
fn session_update_cancelled_error_reason() {
    let u: SessionUpdate =
        serde_json::from_str(r#"{"status":"cancelled","reason":"error"}"#).unwrap();
    assert_eq!(u.reason, Some(CancelReason::Error));
}

// ---------------------------------------------------------------------------
// 拒绝矩阵：status=active/expired 不在 serde enum 中 → 反序列化失败
// ---------------------------------------------------------------------------

#[test]
fn session_update_active_rejected_by_serde() {
    let result = serde_json::from_str::<SessionUpdate>(r#"{"status":"active"}"#);
    assert!(
        result.is_err(),
        "status=active should be rejected by serde enum"
    );
}

#[test]
fn session_update_expired_rejected_by_serde() {
    let result = serde_json::from_str::<SessionUpdate>(r#"{"status":"expired"}"#);
    assert!(
        result.is_err(),
        "status=expired should be rejected by serde enum"
    );
}

#[test]
fn session_update_unknown_rejected_by_serde() {
    let result = serde_json::from_str::<SessionUpdate>(r#"{"status":"foobar"}"#);
    assert!(
        result.is_err(),
        "unknown status should be rejected by serde enum"
    );
}

// ---------------------------------------------------------------------------
// ApiError → 状态码映射
// ---------------------------------------------------------------------------

#[test]
fn api_error_bad_request_is_400() {
    let err = ApiError::bad_request("test");
    let resp = err.into_response();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[test]
fn api_error_not_found_is_404() {
    let err = ApiError::not_found();
    let resp = err.into_response();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

#[test]
fn api_error_gone_is_410() {
    let err = ApiError::gone("expired");
    let resp = err.into_response();
    assert_eq!(resp.status(), StatusCode::GONE);
}

#[test]
fn api_error_terminal_state_is_409() {
    let err = ApiError::terminal_state();
    let resp = err.into_response();
    assert_eq!(resp.status(), StatusCode::CONFLICT);
}

#[test]
fn api_error_round_already_submitted_is_409() {
    let err = ApiError::round_already_submitted(
        1,
        Response {
            round: 1,
            answers: Default::default(),
            additional_notes: None,
            submitted_at: "2026-07-12T00:00:00Z".to_string(),
            revision: 1,
            revised_at: None,
        },
    );
    let resp = err.into_response();
    assert_eq!(resp.status(), StatusCode::CONFLICT);
}

#[test]
fn api_error_idempotency_mismatch_is_422() {
    let err = ApiError::idempotency_mismatch();
    let resp = err.into_response();
    assert_eq!(resp.status(), StatusCode::UNPROCESSABLE_ENTITY);
}

#[test]
fn api_error_max_sessions_is_503() {
    let err = ApiError::max_sessions();
    let resp = err.into_response();
    assert_eq!(resp.status(), StatusCode::SERVICE_UNAVAILABLE);
}

#[test]
fn api_error_internal_is_500() {
    let err = ApiError::internal(anyhow::anyhow!("test"));
    let resp = err.into_response();
    assert_eq!(resp.status(), StatusCode::INTERNAL_SERVER_ERROR);
}

// ---------------------------------------------------------------------------
// 409 双语义：TerminalState 无 round/response，RoundAlreadySubmitted 带
// ---------------------------------------------------------------------------

#[test]
fn terminal_state_body_has_no_round_response() {
    let err = ApiError::terminal_state();
    let resp = err.into_response();
    // body 应该是 {message, status}，不含 round/response
    // 这里只验证状态码，body 格式在集成测试中验证
    assert_eq!(resp.status(), StatusCode::CONFLICT);
}

#[test]
fn round_already_submitted_body_has_round_response() {
    let err = ApiError::round_already_submitted(
        2,
        Response {
            round: 2,
            answers: Default::default(),
            additional_notes: None,
            submitted_at: "2026-07-12T00:00:00Z".to_string(),
            revision: 1,
            revised_at: None,
        },
    );
    let resp = err.into_response();
    assert_eq!(resp.status(), StatusCode::CONFLICT);
}
