//! Integration test harness.
//!
//! Each test gets an isolated `AppState` backed by a fresh on-disk SQLite
//! temp file (so migrations run clean and no cross-test pollution), plus a
//! router built WITHOUT the governor layer (DESIGN.md §735 limits POST
//! /sessions to 20/min — far below the suite's creation volume; testing the
//! limiter itself is a dedicated case that spins up its own server).
//!
//! Requests are dispatched via `tower::ServiceExt::oneshot` against the
//! `Router` — no real TCP listener, no port, no rate-limit interference.

use grilling_sleek::idempotency;
use grilling_sleek::observability::metrics;
use grilling_sleek::session;
use grilling_sleek::{build_app, AppState};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Pool, Sqlite};
use std::str::FromStr;
use tempfile::TempDir;
use tower::ServiceExt;

/// A per-test harness: owns the temp DB dir (cleaned on drop) and exposes
/// the application router for oneshot requests.
pub struct TestApp {
    pub router: axum::Router,
    _db_dir: TempDir,
}

impl TestApp {
    /// Build a fresh app with an empty DB. Migrations are applied.
    pub async fn new() -> Self {
        // Initialise the global metrics registry once per process (idempotent).
        metrics::init_metrics();

        let dir = TempDir::new().expect("temp dir");
        let db_path = dir.path().join("test.db");
        let opts = SqliteConnectOptions::from_str(&format!(
            "sqlite://{}?mode=rwc",
            db_path.display()
        ))
        .unwrap()
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .synchronous(sqlx::sqlite::SqliteSynchronous::Normal)
        .foreign_keys(true);

        let pool: Pool<Sqlite> = SqlitePoolOptions::new()
            .max_connections(8)
            .connect_with(opts)
            .await
            .expect("connect pool");
        sqlx::migrate!("./migrations").run(&pool).await.expect("migrate");

        let handles = session::new_session_map();
        let state = AppState {
            pool,
            handles,
            idempotency_sessions: idempotency::new_cache(
                grilling_sleek::config::IDEMPOTENCY_TTL,
                grilling_sleek::config::IDEMPOTENCY_CAPACITY,
            ),
            idempotency_rounds: idempotency::new_cache(
                grilling_sleek::config::IDEMPOTENCY_TTL,
                grilling_sleek::config::IDEMPOTENCY_CAPACITY,
            ),
            base_url: "https://test.example".to_string(),
        };

        let router = build_app(state);
        TestApp {
            router,
            _db_dir: dir,
        }
    }

    /// Convenience: dispatch a request and return the response.
    pub async fn oneshot(&self, req: axum::extract::Request) -> axum::response::Response {
        self.router.clone().oneshot(req).await.expect("oneshot")
    }
}

/// Build a JSON POST request to the given path.
pub fn json_post(path: &str, body: &serde_json::Value) -> axum::extract::Request {
    axum::http::Request::builder()
        .method("POST")
        .uri(path)
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(body.to_string()))
        .unwrap()
}

/// Build a JSON PATCH request to the given path.
pub fn json_patch(path: &str, body: &serde_json::Value) -> axum::extract::Request {
    axum::http::Request::builder()
        .method("PATCH")
        .uri(path)
        .header("Content-Type", "application/json")
        .body(axum::body::Body::from(body.to_string()))
        .unwrap()
}

/// Build a GET request to the given path.
pub fn get_req(path: &str) -> axum::extract::Request {
    axum::http::Request::builder()
        .method("GET")
        .uri(path)
        .body(axum::body::Body::empty())
        .unwrap()
}

/// Read a response body as a JSON value.
pub async fn body_json(resp: axum::response::Response) -> serde_json::Value {
    let bytes = axum::body::to_bytes(resp.into_body(), 1024 * 1024)
        .await
        .expect("read body");
    serde_json::from_slice(&bytes).expect("parse json")
}

/// A minimal valid Grilling payload with a single text question.
pub fn grilling_minimal(name: &str) -> serde_json::Value {
    serde_json::json!({
        "name": name,
        "questions": [
            {"id": "q_auth", "header": "Auth", "text": "Which auth?", "type": "single",
             "options": [{"label": "JWT"}, {"label": "Session"}], "recommended": 0},
            {"id": "q_notes", "header": "Notes", "text": "Any notes?", "type": "text", "required": false}
        ]
    })
}
