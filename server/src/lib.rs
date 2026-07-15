pub mod config;
pub mod db;
pub mod error;
pub mod extractors;
pub mod handlers;
pub mod idempotency;
pub mod models;
pub mod observability;
pub mod session;
pub mod sse;
pub mod validation;

use axum::extract::{DefaultBodyLimit, Request};
use axum::middleware::{self, Next};
use axum::response::Response;
use axum::routing::{get, post};
use axum::Router;
use std::time::Instant;
use tower_http::catch_panic::CatchPanicLayer;
use tower_http::trace::TraceLayer;

use sqlx::{Pool, Sqlite};
use session::SessionMap;

/// Shared application state.
#[derive(Clone)]
pub struct AppState {
    pub pool: Pool<Sqlite>,
    pub handles: SessionMap,
    pub idempotency_sessions: idempotency::IdempotencyCache,
    pub idempotency_rounds: idempotency::IdempotencyCache,
    pub base_url: String,
}

/// 组装全部业务路由；`sessions_post` 由调用方注入，使生产环境可挂 governor
/// 而测试环境保持裸 handler。路由表在此唯一声明（M-SINGLE-ITEM-PATH）。
pub fn assemble_routes(sessions_post: axum::routing::MethodRouter<AppState>) -> Router<AppState> {
    Router::new()
        // Health probes
        .route("/v1/healthz", get(handlers::sessions::healthz))
        .route("/v1/readyz", get(handlers::sessions::readyz))
        // Sessions
        .route("/v1/sessions", sessions_post)
        .route(
            "/v1/sessions/{session_id}",
            get(handlers::sessions::get_session).patch(handlers::sessions::update_session),
        )
        // Rounds
        .route(
            "/v1/sessions/{session_id}/rounds",
            get(handlers::rounds::list_rounds).post(handlers::rounds::create_round),
        )
        .route(
            "/v1/sessions/{session_id}/rounds/current",
            get(handlers::rounds::get_current_round),
        )
        .route(
            "/v1/sessions/{session_id}/rounds/{round}",
            get(handlers::rounds::get_round),
        )
        // Response (long-poll GET + submit POST)
        .route(
            "/v1/sessions/{session_id}/rounds/{round}/response",
            get(handlers::response::long_poll_response)
                .post(handlers::response::submit_response),
        )
        // SSE
        .route(
            "/v1/sessions/{session_id}/events",
            get(handlers::sse::sse_handler),
        )
}

/// Build the application router WITHOUT the rate-limit layer.
///
/// Used by integration tests (which must not share a per-IP governor bucket
/// across test cases — DESIGN.md §735 limits only POST /sessions to 20/min,
/// far below the test suite's creation volume). Production attaches the
/// governor layer in `main.rs` via `assemble_routes`.
pub fn build_app(state: AppState) -> Router {
    apply_middleware(assemble_routes(post(handlers::sessions::create_session)))
        .with_state(state)
}

/// The shared middleware stack applied to both the production router (in
/// `main.rs`, which additionally attaches the governor layer to POST /sessions)
/// and the test router (`build_app`). Order is significant — see the comment
/// where it's applied.
pub fn apply_middleware<S>(router: Router<S>) -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    router
        // innermost first:
        .layer(middleware::from_fn(http_duration_middleware))
        .layer(tower_http::request_id::PropagateRequestIdLayer::x_request_id())
        .layer(
            TraceLayer::new_for_http().make_span_with(|request: &axum::extract::Request| {
                let request_id = request
                    .headers()
                    .get("x-request-id")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("-")
                    .to_string();
                tracing::info_span!(
                    "http.request",
                    method = %request.method(),
                    uri = %request.uri(),
                    request_id = %request_id,
                )
            }),
        )
        // outermost: SetRequestId runs first on the request, so TraceLayer &
        // Propagate see the assigned id.
        .layer(tower_http::request_id::SetRequestIdLayer::x_request_id(
            tower_http::request_id::MakeRequestUuid,
        ))
        .layer(CatchPanicLayer::new())
        .layer(DefaultBodyLimit::max(64 * 1024))
}

/// Records `http_request_duration_seconds` (with method/path/status labels) for
/// each request. DESIGN.md §2306.
pub async fn http_duration_middleware(request: Request, next: Next) -> Response {
    let start = Instant::now();
    let method = request.method().to_string();
    let path = request
        .uri()
        .path()
        // Normalise variable segments so the cardinality stays bounded: collapse
        // /v1/sessions/{id}/... to /v1/sessions/:id/... patterns by path index.
        .to_string();
    let response = next.run(request).await;
    let elapsed = start.elapsed().as_secs_f64();
    if let Some(m) = observability::metrics::metrics() {
        let status = response.status().as_u16().to_string();
        m.http_request_duration_seconds.record(
            elapsed,
            &[
                opentelemetry::KeyValue::new("method", method),
                opentelemetry::KeyValue::new("path", normalise_path(&path)),
                opentelemetry::KeyValue::new("status", status),
            ],
        );
    }
    response
}

/// Collapse variable path segments so metric label cardinality is bounded.
/// e.g. `/v1/sessions/abc123/rounds` → `/v1/sessions/:id/rounds`.
fn normalise_path(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    for (i, seg) in path.split('/').enumerate() {
        if i > 0 {
            out.push('/');
        }
        if seg.is_empty() {
            continue;
        }
        // Heuristic: base64url session ids are ≥20 chars; round seqs are pure
        // digits. Replace both with placeholders.
        if seg.len() >= 20 || seg.chars().all(|c| c.is_ascii_digit()) {
            out.push_str(":id");
        } else {
            out.push_str(seg);
        }
    }
    out
}
