//! Integration tests — response revision (PUT) semantics and the long-poll
//! revision wake. Companion to `integration.rs` (lifecycle scenarios).

mod common;

use common::{TestApp, body_json, get_req, grilling_minimal, json_patch, json_post};
use serde_json::json;
use std::time::Duration;
use std::time::Instant;
use tower::ServiceExt;

// Helper: create a session, return its id.
async fn create_session(app: &TestApp) -> String {
    let resp = app
        .oneshot(json_post("/v1/sessions", &grilling_minimal("s")))
        .await;
    assert_eq!(resp.status(), 201);
    (body_json(resp).await)["session_id"]
        .as_str()
        .unwrap()
        .to_string()
}

fn json_put(path: &str, body: &serde_json::Value) -> axum::extract::Request {
    axum::http::Request::builder()
        .method("PUT")
        .uri(path)
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(body.to_string()))
        .unwrap()
}

/// create → answer r1 → push r2, so r1 is an answered past round.
async fn setup_two_rounds(app: &TestApp) -> String {
    let sid = create_session(app).await;
    let resp = app
        .oneshot(json_post(
            &format!("/v1/sessions/{sid}/rounds/1/response"),
            &json!({"answers":{"q_auth":{"selected":"JWT"}}}),
        ))
        .await;
    assert_eq!(resp.status(), 201);
    let resp = app
        .oneshot(json_post(
            &format!("/v1/sessions/{sid}/rounds"),
            &json!({"name":"r2","questions":[{"id":"q_d","header":"D","text":"Deep?","type":"single","options":[{"label":"A"},{"label":"B"}]}]}),
        ))
        .await;
    assert_eq!(resp.status(), 201);
    sid
}

// ---------------------------------------------------------------------------
// 1. Revision happy path: latest wins, counter bumps, timestamps keep sense
// ---------------------------------------------------------------------------

#[tokio::test]
async fn revision_happy_path() {
    let app = TestApp::new().await;
    let sid = setup_two_rounds(&app).await;

    // GET before revision: revision 1, no revised_at
    let resp = app
        .oneshot(get_req(&format!("/v1/sessions/{sid}/rounds/1")))
        .await;
    let before = (body_json(resp).await)["response"].clone();
    assert_eq!(before["revision"], 1);
    // revised_at is skipped entirely when the round was never revised
    assert!(before.get("revised_at").is_none());

    // PUT revise r1
    let resp = app
        .oneshot(json_put(
            &format!("/v1/sessions/{sid}/rounds/1/response"),
            &json!({"answers":{"q_auth":{"selected":"Session"}},"additional_notes":"changed my mind"}),
        ))
        .await;
    assert_eq!(resp.status(), 200);
    let revised = body_json(resp).await;
    assert_eq!(revised["revision"], 2);
    assert!(revised["revised_at"].as_str().is_some());
    // submitted_at is the first-submission timestamp, immutable
    assert_eq!(revised["submitted_at"], before["submitted_at"]);
    assert_eq!(revised["answers"]["q_auth"]["selected"], "Session");

    // Stored state reflects the revision
    let resp = app
        .oneshot(get_req(&format!("/v1/sessions/{sid}/rounds/1")))
        .await;
    let after = (body_json(resp).await)["response"].clone();
    assert_eq!(after["revision"], 2);
    assert_eq!(after["answers"]["q_auth"]["selected"], "Session");

    // Round summary carries the counter
    let resp = app
        .oneshot(get_req(&format!("/v1/sessions/{sid}/rounds")))
        .await;
    let list = (body_json(resp).await).as_array().unwrap().clone();
    assert_eq!(list[0]["revision"], 2);
    assert_eq!(list[1]["revision"], 1);

    // Plain GET of the response (agent path) returns the revised version
    let resp = app
        .oneshot(get_req(&format!("/v1/sessions/{sid}/rounds/1/response")))
        .await;
    assert_eq!(resp.status(), 200);
    let direct = body_json(resp).await;
    assert_eq!(direct["revision"], 2);
    assert_eq!(direct["answers"]["q_auth"]["selected"], "Session");
}

// ---------------------------------------------------------------------------
// 2. PUT rejection paths
// ---------------------------------------------------------------------------

#[tokio::test]
async fn put_on_unanswered_round_is_409() {
    let app = TestApp::new().await;
    let sid = create_session(&app).await; // round 1 exists, unanswered

    let resp = app
        .oneshot(json_put(
            &format!("/v1/sessions/{sid}/rounds/1/response"),
            &json!({"answers":{"q_auth":{"selected":"JWT"}}}),
        ))
        .await;
    assert_eq!(resp.status(), 409);
    let body = body_json(resp).await;
    assert!(body["message"].as_str().unwrap().contains("POST"));
}

#[tokio::test]
async fn put_on_missing_round_is_404() {
    let app = TestApp::new().await;
    let sid = create_session(&app).await;
    let resp = app
        .oneshot(json_put(
            &format!("/v1/sessions/{sid}/rounds/99/response"),
            &json!({"answers":{"q_auth":{"selected":"JWT"}}}),
        ))
        .await;
    assert_eq!(resp.status(), 404);
}

#[tokio::test]
async fn put_with_invalid_body_is_400() {
    let app = TestApp::new().await;
    let sid = setup_two_rounds(&app).await;

    // q_auth is required; omitting it fails grilling validation
    let resp = app
        .oneshot(json_put(
            &format!("/v1/sessions/{sid}/rounds/1/response"),
            &json!({"answers":{"q_notes":{"selected":"note"}}}),
        ))
        .await;
    assert_eq!(resp.status(), 400);
}

#[tokio::test]
async fn put_on_terminal_session_is_410() {
    let app = TestApp::new().await;
    let sid = setup_two_rounds(&app).await;
    let resp = app
        .oneshot(json_patch(
            &format!("/v1/sessions/{sid}"),
            &json!({"status":"completed"}),
        ))
        .await;
    assert_eq!(resp.status(), 200);

    let resp = app
        .oneshot(json_put(
            &format!("/v1/sessions/{sid}/rounds/1/response"),
            &json!({"answers":{"q_auth":{"selected":"Session"}}}),
        ))
        .await;
    assert_eq!(resp.status(), 410);
}

// ---------------------------------------------------------------------------
// 3. POST write-once contract is untouched by the revision feature
// ---------------------------------------------------------------------------

#[tokio::test]
async fn post_remains_write_once() {
    let app = TestApp::new().await;
    let sid = create_session(&app).await;
    let body = json!({"answers":{"q_auth":{"selected":"JWT"}}});

    let resp = app
        .oneshot(json_post(
            &format!("/v1/sessions/{sid}/rounds/1/response"),
            &body,
        ))
        .await;
    assert_eq!(resp.status(), 201);
    let resp = app
        .oneshot(json_post(
            &format!("/v1/sessions/{sid}/rounds/1/response"),
            &body,
        ))
        .await;
    assert_eq!(resp.status(), 409);
    let conflict = body_json(resp).await;
    assert_eq!(conflict["round"], 1);
    assert_eq!(conflict["response"]["revision"], 1);
}

// ---------------------------------------------------------------------------
// 4. Long-poll wake: a revision on another round surfaces as 202 + revised
// ---------------------------------------------------------------------------

#[tokio::test]
async fn longpoll_wakes_on_revision_of_other_round() {
    let app = TestApp::new().await;
    let sid = setup_two_rounds(&app).await; // r2 current & unanswered

    // Park a long-poll on round 2 (wait=10s).
    let router = app.router.clone();
    let poll_sid = sid.clone();
    let poll = tokio::spawn(async move {
        router
            .oneshot(get_req(&format!(
                "/v1/sessions/{poll_sid}/rounds/2/response?wait=10"
            )))
            .await
            .expect("oneshot")
    });

    // Let the waiter park, then revise round 1.
    tokio::time::sleep(Duration::from_millis(200)).await;
    let resp = app
        .oneshot(json_put(
            &format!("/v1/sessions/{sid}/rounds/1/response"),
            &json!({"answers":{"q_auth":{"selected":"Session"}}}),
        ))
        .await;
    assert_eq!(resp.status(), 200);

    let start = Instant::now();
    let poll_resp = poll.await.expect("join");
    let elapsed = start.elapsed();

    assert_eq!(poll_resp.status(), 202);
    let body = body_json(poll_resp).await;
    assert_eq!(body["status"], "pending");
    assert_eq!(body["revised"]["round"], 1);
    assert_eq!(body["revised"]["revision"], 2);

    // The wake must be prompt: with wait=10 the timeout path would also carry
    // `revised`, so only the elapsed bound proves the wake actually happened.
    assert!(
        elapsed < Duration::from_secs(5),
        "long-poll should wake promptly, took {elapsed:?}"
    );
}

// ---------------------------------------------------------------------------
// 5. Sequential revisions keep incrementing
// ---------------------------------------------------------------------------

#[tokio::test]
async fn revision_counter_is_monotonic() {
    let app = TestApp::new().await;
    let sid = setup_two_rounds(&app).await;

    for expected in 2..=3 {
        let resp = app
            .oneshot(json_put(
                &format!("/v1/sessions/{sid}/rounds/1/response"),
                &json!({"answers":{"q_auth":{"selected":"JWT"}}}),
            ))
            .await;
        assert_eq!(resp.status(), 200);
        assert_eq!((body_json(resp).await)["revision"], expected);
    }
}
