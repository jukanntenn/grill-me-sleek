//! Integration tests — DESIGN.md §2489-2507 (16 scenarios).
//!
//! Each test runs against an isolated router + temp DB via `oneshot` (no real
//! TCP listener, no rate-limit interference, no cross-test pollution). See
//! `common/mod.rs` for the harness.

mod common;

use common::{body_json, get_req, grilling_minimal, json_patch, json_post, TestApp};
use serde_json::json;

// Helper: create a session, return its id.
async fn create_session(app: &TestApp) -> String {
    let resp = app.oneshot(json_post("/v1/sessions", &grilling_minimal("s"))).await;
    assert_eq!(resp.status(), 201);
    (body_json(resp).await)["session_id"].as_str().unwrap().to_string()
}

// ---------------------------------------------------------------------------
// 1. 完整会话生命周期：创建 → 答题 → 多轮 push → completed
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_1_full_session_lifecycle() {
    let app = TestApp::new().await;
    let sid = create_session(&app).await;

    // answer round 1
    let resp = app
        .oneshot(json_post(
            &format!("/v1/sessions/{sid}/rounds/1/response"),
            &json!({"answers":{"q_auth":{"selected":"JWT"}}}),
        ))
        .await;
    assert_eq!(resp.status(), 201);

    // push round 2
    let resp = app
        .oneshot(json_post(
            &format!("/v1/sessions/{sid}/rounds"),
            &json!({"name":"r2","questions":[{"id":"q_d","header":"D","text":"Deep?","type":"single","options":[{"label":"A"},{"label":"B"}]}]}),
        ))
        .await;
    assert_eq!(resp.status(), 201);
    assert_eq!((body_json(resp).await)["round"], 2);

    // answer round 2
    let resp = app
        .oneshot(json_post(
            &format!("/v1/sessions/{sid}/rounds/2/response"),
            &json!({"answers":{"q_d":{"selected":"A"}}}),
        ))
        .await;
    assert_eq!(resp.status(), 201);

    // complete
    let resp = app
        .oneshot(json_patch(&format!("/v1/sessions/{sid}"), &json!({"status":"completed"})))
        .await;
    assert_eq!(resp.status(), 200);
}

// ---------------------------------------------------------------------------
// 2. 多轮历史保留
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_2_multi_round_history_preserved() {
    let app = TestApp::new().await;
    let sid = create_session(&app).await;

    // answer + push x2
    for n in 1..=2 {
        let _ = app
            .oneshot(json_post(
                &format!("/v1/sessions/{sid}/rounds/{n}/response"),
                &json!({"answers":{"q_auth":{"selected":"JWT"}}}),
            ))
            .await;
        if n < 2 {
            let _ = app
                .oneshot(json_post(
                    &format!("/v1/sessions/{sid}/rounds"),
                    &json!({"name":"next","questions":[{"id":"q_auth","header":"A","text":"a?","type":"text"}]}),
                ))
                .await;
        }
    }

    // list all rounds — both should be present, ordered by seq
    let resp = app.oneshot(get_req(&format!("/v1/sessions/{sid}/rounds"))).await;
    assert_eq!(resp.status(), 200);
    let list = (body_json(resp).await).as_array().unwrap().clone();
    assert_eq!(list.len(), 2);
    assert_eq!(list[0]["round"], 1);
    assert_eq!(list[1]["round"], 2);
    assert_eq!(list[0]["has_response"], true);
}

// ---------------------------------------------------------------------------
// 3. 终态归档（completed / cancelled）
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_3_archive_on_completed() {
    let app = TestApp::new().await;
    let sid = create_session(&app).await;
    let _ = app
        .oneshot(json_patch(&format!("/v1/sessions/{sid}"), &json!({"status":"completed"})))
        .await;

    // GET now returns 410 gone, detail=completed (session moved to archive)
    let resp = app.oneshot(get_req(&format!("/v1/sessions/{sid}"))).await;
    assert_eq!(resp.status(), 410);
    let b = body_json(resp).await;
    assert_eq!(b["status"], "gone");
    assert_eq!(b["detail"], "completed");
}

#[tokio::test]
async fn test_3_archive_on_cancelled() {
    let app = TestApp::new().await;
    let sid = create_session(&app).await;
    let _ = app
        .oneshot(json_patch(
            &format!("/v1/sessions/{sid}"),
            &json!({"status":"cancelled","reason":"agent_aborted","actor":"agent"}),
        ))
        .await;

    let resp = app.oneshot(get_req(&format!("/v1/sessions/{sid}"))).await;
    assert_eq!(resp.status(), 410);
    let b = body_json(resp).await;
    assert_eq!(b["status"], "gone");
    assert_eq!(b["detail"], "cancelled");
}

// ---------------------------------------------------------------------------
// 4. 用户取消
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_4_user_cancel() {
    let app = TestApp::new().await;
    let sid = create_session(&app).await;
    let resp = app
        .oneshot(json_patch(
            &format!("/v1/sessions/{sid}"),
            &json!({"status":"cancelled","reason":"user_cancelled","actor":"user"}),
        ))
        .await;
    assert_eq!(resp.status(), 200);
    assert_eq!((body_json(resp).await)["status"], "cancelled");
}

// ---------------------------------------------------------------------------
// 5. agent 取消
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_5_agent_cancel() {
    let app = TestApp::new().await;
    let sid = create_session(&app).await;
    let resp = app
        .oneshot(json_patch(
            &format!("/v1/sessions/{sid}"),
            &json!({"status":"cancelled","reason":"agent_aborted","actor":"agent"}),
        ))
        .await;
    assert_eq!(resp.status(), 200);
}

// ---------------------------------------------------------------------------
// 6. PATCH 强校验拒绝矩阵
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_6_patch_terminal_returns_409() {
    let app = TestApp::new().await;
    let sid = create_session(&app).await;
    // complete first
    let _ = app
        .oneshot(json_patch(&format!("/v1/sessions/{sid}"), &json!({"status":"completed"})))
        .await;
    // terminal -> any PATCH must be 409, body {message,status:409} (no round/response)
    let resp = app
        .oneshot(json_patch(&format!("/v1/sessions/{sid}"), &json!({"status":"cancelled"})))
        .await;
    assert_eq!(resp.status(), 409);
    let b = body_json(resp).await;
    assert_eq!(b["status"], 409);
    assert!(b.get("round").is_none() || b["round"].is_null());
}

#[tokio::test]
async fn test_6_patch_invalid_status_rejected_by_serde() {
    // status=active / expired / unknown are not in the serde enum → 422 (axum Json
    // rejection) or 400 depending on the rejection handler; the key point is it's
    // NOT 200 and the session stays active.
    let app = TestApp::new().await;
    let sid = create_session(&app).await;

    let resp = app
        .oneshot(json_patch(&format!("/v1/sessions/{sid}"), &json!({"status":"active"})))
        .await;
    assert_ne!(resp.status(), 200);

    // session is still active and queryable
    let resp = app.oneshot(get_req(&format!("/v1/sessions/{sid}"))).await;
    assert_eq!(resp.status(), 200);
}

// ---------------------------------------------------------------------------
// 7. long-poll: 已提交立即返回 200
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_7_long_poll_returns_answer_when_submitted() {
    let app = TestApp::new().await;
    let sid = create_session(&app).await;

    // submit first
    let _ = app
        .oneshot(json_post(
            &format!("/v1/sessions/{sid}/rounds/1/response"),
            &json!({"answers":{"q_auth":{"selected":"JWT"}}}),
        ))
        .await;

    // long-poll should immediately return 200 with the answer
    let resp = app
        .oneshot(get_req(&format!("/v1/sessions/{sid}/rounds/1/response?wait=1")))
        .await;
    assert_eq!(resp.status(), 200);
    let b = body_json(resp).await;
    assert_eq!(b["answers"]["q_auth"]["selected"], "JWT");
}

#[tokio::test]
async fn test_7_long_poll_pending_returns_202() {
    let app = TestApp::new().await;
    let sid = create_session(&app).await;

    // no answer yet — long-poll should block ~1s then return 202 pending
    let resp = app
        .oneshot(get_req(&format!("/v1/sessions/{sid}/rounds/1/response?wait=1")))
        .await;
    let status = resp.status();
    let bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
    let text = String::from_utf8_lossy(&bytes);
    assert_eq!(status, 202, "body was: {text}");
}

// ---------------------------------------------------------------------------
// 8/9. SSE — covered separately by a long-lived server test (oneshot cannot
//      hold a streaming connection open). Skipped here; the handler logic is
//      exercised via the broadcast hub directly in unit tests.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 10. ETag 条件请求
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_10_etag_conditional() {
    let app = TestApp::new().await;
    let sid = create_session(&app).await;

    // first GET round → 200 + ETag
    let resp = app.oneshot(get_req(&format!("/v1/sessions/{sid}/rounds/1"))).await;
    assert_eq!(resp.status(), 200);
    let etag = resp.headers().get("etag").unwrap().to_str().unwrap().to_string();
    assert!(etag.starts_with("W/\""));

    // second GET with If-None-Match matching → 304
    let req = axum::http::Request::builder()
        .method("GET")
        .uri(format!("/v1/sessions/{sid}/rounds/1"))
        .header("If-None-Match", &etag)
        .body(axum::body::Body::empty())
        .unwrap();
    let resp = app.oneshot(req).await;
    assert_eq!(resp.status(), 304);

    // GET with non-matching ETag → 200
    let req = axum::http::Request::builder()
        .method("GET")
        .uri(format!("/v1/sessions/{sid}/rounds/1"))
        .header("If-None-Match", "W/\"deadbeefdeadbeef\"")
        .body(axum::body::Body::empty())
        .unwrap();
    let resp = app.oneshot(req).await;
    assert_eq!(resp.status(), 200);
}

// ---------------------------------------------------------------------------
// 11. 限流 — requires a real TCP server with the governor layer attached.
//      Skipped in the oneshot harness (which deliberately omits the limiter);
//      the limiter config + default headers are validated in a dedicated
//      live-server test in `tests/rate_limit.rs`.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 12. 幂等重放
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_12_idempotency_replay() {
    let app = TestApp::new().await;
    let body = grilling_minimal("idem");

    let req = axum::http::Request::builder()
        .method("POST")
        .uri("/v1/sessions")
        .header("Content-Type", "application/json")
        .header("Idempotency-Key", "key-abc-123")
        .body(axum::body::Body::from(body.to_string()))
        .unwrap();
    let resp = app.oneshot(req).await;
    assert_eq!(resp.status(), 201);
    let sid1 = (body_json(resp).await)["session_id"].as_str().unwrap().to_string();

    // replay with same key + same body → same session_id
    let req = axum::http::Request::builder()
        .method("POST")
        .uri("/v1/sessions")
        .header("Content-Type", "application/json")
        .header("Idempotency-Key", "key-abc-123")
        .body(axum::body::Body::from(body.to_string()))
        .unwrap();
    let resp = app.oneshot(req).await;
    assert_eq!(resp.status(), 201);
    let sid2 = (body_json(resp).await)["session_id"].as_str().unwrap().to_string();
    assert_eq!(sid1, sid2);
}

#[tokio::test]
async fn test_12_idempotency_mismatch_returns_422() {
    let app = TestApp::new().await;
    let body1 = grilling_minimal("idem-a");
    let body2 = serde_json::json!({
        "name": "idem-b",
        "questions": [{"id":"q_x","header":"X","text":"x?","type":"text"}]
    });

    let req = axum::http::Request::builder()
        .method("POST").uri("/v1/sessions")
        .header("Content-Type", "application/json")
        .header("Idempotency-Key", "key-same")
        .body(axum::body::Body::from(body1.to_string())).unwrap();
    let resp = app.oneshot(req).await;
    assert_eq!(resp.status(), 201);

    // same key, different body → 422
    let req = axum::http::Request::builder()
        .method("POST").uri("/v1/sessions")
        .header("Content-Type", "application/json")
        .header("Idempotency-Key", "key-same")
        .body(axum::body::Body::from(body2.to_string())).unwrap();
    let resp = app.oneshot(req).await;
    assert_eq!(resp.status(), 422);
}

#[tokio::test]
async fn test_12_idempotency_concurrent_dedup() {
    // DESIGN.md §1481 — moka `try_get_with` coalesces concurrent calls on the
    // same not-yet-existing key into a single creation. Two simultaneous POSTs
    // with the same key must return the SAME session_id (only one creation ran).
    let app = std::sync::Arc::new(TestApp::new().await);
    let body = grilling_minimal("concurrent-idem");
    let key = "concurrent-key-xyz";

    let make_req = || {
        axum::http::Request::builder()
            .method("POST").uri("/v1/sessions")
            .header("Content-Type", "application/json")
            .header("Idempotency-Key", key)
            .body(axum::body::Body::from(body.to_string())).unwrap()
    };

    // Fire both concurrently. oneshot consumes the router, so clone it.
    let app1 = app.clone();
    let app2 = app.clone();
    let (r1, r2) = tokio::join!(
        async move { app1.oneshot(make_req()).await },
        async move { app2.oneshot(make_req()).await },
    );

    assert_eq!(r1.status(), 201);
    assert_eq!(r2.status(), 201);
    let sid1 = body_json(r1).await["session_id"].as_str().unwrap().to_string();
    let sid2 = body_json(r2).await["session_id"].as_str().unwrap().to_string();
    assert_eq!(sid1, sid2, "concurrent same-key dedup must return same id");
}

// ---------------------------------------------------------------------------
// 13. 415 Content-Type 自动（非 application/json）
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_13_content_type_415() {
    let app = TestApp::new().await;
    // POST with text/plain body → axum Json extractor rejects with 415
    let req = axum::http::Request::builder()
        .method("POST").uri("/v1/sessions")
        .header("Content-Type", "text/plain")
        .body(axum::body::Body::from("not json")).unwrap();
    let resp = app.oneshot(req).await;
    assert_eq!(resp.status(), 415);
}

// ---------------------------------------------------------------------------
// 14. Schema 校验拒绝无效输入
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_14_schema_validation() {
    let app = TestApp::new().await;

    // missing questions → 400
    let resp = app.oneshot(json_post("/v1/sessions", &json!({"name":"t"}))).await;
    assert_eq!(resp.status(), 400);

    // empty questions → 400
    let resp = app
        .oneshot(json_post("/v1/sessions", &json!({"name":"t","questions":[]})))
        .await;
    assert_eq!(resp.status(), 400);

    // missing type → 400
    let resp = app
        .oneshot(json_post(
            "/v1/sessions",
            &json!({"name":"t","questions":[{"id":"q","header":"h","text":"t"}]}),
        ))
        .await;
    assert_eq!(resp.status(), 400);
}

// ---------------------------------------------------------------------------
// 15. 重复 question ID → 400
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_15_duplicate_question_id() {
    let app = TestApp::new().await;
    let body = json!({
        "name":"t",
        "questions":[
            {"id":"q1","header":"h1","text":"t1","type":"text"},
            {"id":"q1","header":"h2","text":"t2","type":"text"}
        ]
    });
    let resp = app.oneshot(json_post("/v1/sessions", &body)).await;
    assert_eq!(resp.status(), 400);
    let b = body_json(resp).await;
    assert!(b["message"].as_str().unwrap().contains("duplicate question id"));
}

// ---------------------------------------------------------------------------
// 16. 并发提交冲突（409 携带已提交 response）
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_16_concurrent_submit_conflict() {
    let app = TestApp::new().await;
    let sid = create_session(&app).await;

    // first submit succeeds
    let resp = app
        .oneshot(json_post(
            &format!("/v1/sessions/{sid}/rounds/1/response"),
            &json!({"answers":{"q_auth":{"selected":"JWT"}}}),
        ))
        .await;
    assert_eq!(resp.status(), 201);

    // second submit (same round) → 409 with body containing the submitted response
    let resp = app
        .oneshot(json_post(
            &format!("/v1/sessions/{sid}/rounds/1/response"),
            &json!({"answers":{"q_auth":{"selected":"Session"}}}),
        ))
        .await;
    assert_eq!(resp.status(), 409);
    let b = body_json(resp).await;
    assert_eq!(b["status"], 409);
    assert_eq!(b["round"], 1);
    assert_eq!(b["response"]["answers"]["q_auth"]["selected"], "JWT");
}

// ---------------------------------------------------------------------------
// 17. 健康端点
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_17_health_endpoints() {
    let app = TestApp::new().await;
    let resp = app.oneshot(get_req("/v1/healthz")).await;
    assert_eq!(resp.status(), 200);
    let resp = app.oneshot(get_req("/v1/readyz")).await;
    assert_eq!(resp.status(), 200);
}

// ---------------------------------------------------------------------------
// 18. 不存在的会话 → 404
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_18_not_found() {
    let app = TestApp::new().await;
    let resp = app.oneshot(get_req("/v1/sessions/nonexistent")).await;
    assert_eq!(resp.status(), 404);
    let b = body_json(resp).await;
    assert_eq!(b["status"], 404);
}

// ---------------------------------------------------------------------------
// 19. Response 校验（缺 required / 超长 / 合法）
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_19_response_validation() {
    let app = TestApp::new().await;
    let body = json!({
        "name":"validation",
        "questions":[
            {"id":"q_req","header":"Required","text":"Fill this","type":"text","required":true,"max_length":10}
        ]
    });
    let sid = create_session_with(&app, &body).await;

    // missing required answer → 400
    let resp = app
        .oneshot(json_post(
            &format!("/v1/sessions/{sid}/rounds/1/response"),
            &json!({"answers":{}}),
        ))
        .await;
    assert_eq!(resp.status(), 400);

    // too long → 400
    let resp = app
        .oneshot(json_post(
            &format!("/v1/sessions/{sid}/rounds/1/response"),
            &json!({"answers":{"q_req":{"selected":"this is way too long for max_length 10"}}}),
        ))
        .await;
    assert_eq!(resp.status(), 400);

    // valid → 201
    let resp = app
        .oneshot(json_post(
            &format!("/v1/sessions/{sid}/rounds/1/response"),
            &json!({"answers":{"q_req":{"selected":"ok"}}}),
        ))
        .await;
    assert_eq!(resp.status(), 201);
}

// ---------------------------------------------------------------------------
// 20. TTL 无续期（expires_at 不随活动改变）
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_20_ttl_no_renewal() {
    let app = TestApp::new().await;
    let sid = create_session(&app).await;

    // capture expires_at after create
    let resp = app.oneshot(get_req(&format!("/v1/sessions/{sid}"))).await;
    let expires_after_create = (body_json(resp).await)["expires_at"].as_str().unwrap().to_string();

    // answer + push (both write) — expires_at must NOT change
    let _ = app
        .oneshot(json_post(
            &format!("/v1/sessions/{sid}/rounds/1/response"),
            &json!({"answers":{"q_auth":{"selected":"JWT"}}}),
        ))
        .await;
    let _ = app
        .oneshot(json_post(
            &format!("/v1/sessions/{sid}/rounds"),
            &json!({"name":"r2","questions":[{"id":"q_x","header":"X","text":"x?","type":"text"}]}),
        ))
        .await;

    let resp = app.oneshot(get_req(&format!("/v1/sessions/{sid}"))).await;
    let expires_after_activity = (body_json(resp).await)["expires_at"].as_str().unwrap().to_string();
    assert_eq!(expires_after_create, expires_after_activity);
}

// ---------------------------------------------------------------------------
// 21. GET /rounds/current 返回当前轮
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_21_get_current_round() {
    let app = TestApp::new().await;
    let sid = create_session(&app).await;

    let resp = app.oneshot(get_req(&format!("/v1/sessions/{sid}/rounds/current"))).await;
    assert_eq!(resp.status(), 200);
    let b = body_json(resp).await;
    assert_eq!(b["round"], 1);
    assert!(b["response"].is_null());
}

// ---------------------------------------------------------------------------
// 22. yesno 题型豁免 options（schema if-then）
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_22_yesno_exempt_options() {
    let app = TestApp::new().await;
    let body = json!({
        "name":"yesno",
        "questions":[{"id":"q_yn","header":"Y","text":"ok?","type":"single","variant":"yesno"}]
    });
    let resp = app.oneshot(json_post("/v1/sessions", &body)).await;
    assert_eq!(resp.status(), 201); // yesno passes schema without options
}

#[tokio::test]
async fn test_22b_rating_exempt_options() {
    // DESIGN.md §1566 — rating has no options array (uses rating_max). The
    // schema's if-then must exempt rating just like yesno.
    let app = TestApp::new().await;
    let body = json!({
        "name":"rating",
        "questions":[{"id":"q_r","header":"R","text":"rate?","type":"single","variant":"rating","rating_max":5}]
    });
    let resp = app.oneshot(json_post("/v1/sessions", &body)).await;
    assert_eq!(resp.status(), 201); // rating passes schema without options
}

#[tokio::test]
async fn test_22c_default_single_requires_options() {
    // single with default variant (or omitted) MUST still require options.
    let app = TestApp::new().await;
    let body = json!({
        "name":"bad",
        "questions":[{"id":"q","header":"H","text":"t?","type":"single"}]
    });
    let resp = app.oneshot(json_post("/v1/sessions", &body)).await;
    assert_eq!(resp.status(), 400);
}

// ---------------------------------------------------------------------------
// 23. long-poll 终态返回 cancelled/expired body 格式（DESIGN.md §481-493）
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_23_long_poll_cancelled_body_format() {
    let app = TestApp::new().await;
    let sid = create_session(&app).await;
    // cancel the session
    let _ = app
        .oneshot(json_patch(
            &format!("/v1/sessions/{sid}"),
            &json!({"status":"cancelled","reason":"user_cancelled","actor":"user"}),
        ))
        .await;
    // long-poll on the now-terminal session → 410 with {status:"cancelled",reason}
    let resp = app
        .oneshot(get_req(&format!("/v1/sessions/{sid}/rounds/1/response?wait=1")))
        .await;
    assert_eq!(resp.status(), 410);
    let b = body_json(resp).await;
    assert_eq!(b["status"], "cancelled");
    assert_eq!(b["reason"], "user_cancelled");
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async fn create_session_with(app: &TestApp, body: &serde_json::Value) -> String {
    let resp = app.oneshot(json_post("/v1/sessions", body)).await;
    assert_eq!(resp.status(), 201);
    (body_json(resp).await)["session_id"].as_str().unwrap().to_string()
}
