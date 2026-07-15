use grilling_sleek::config;
use grilling_sleek::db;
use grilling_sleek::handlers;
use grilling_sleek::idempotency;
use grilling_sleek::observability;
use grilling_sleek::session;
use grilling_sleek::AppState;

use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::post;
use axum_governor::{GovernorConfigBuilder, SmartIp};
use ipnet::IpNet;
use std::net::SocketAddr;
use tokio::signal;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load layered configuration (defaults → TOML file → GSLEEK_ env) and install
    // the process-wide singleton before any module reads it.
    let settings = config::Settings::load()?;
    config::init(settings);
    tracing::info!(base_url = %config::settings().base_url, "configuration loaded");

    // Initialize tracing + OTel (now safe to read config::settings())
    let _guard = observability::init_tracing(&config::settings().log_dir);

    // Initialize business metrics
    observability::metrics::init_metrics();

    tracing::info!("starting grilling-sleek server");

    // Initialize database
    let pool = db::create_pool().await?;
    db::run_migrations(&pool).await?;
    tracing::info!("database initialized");

    // Initialize session handle map
    let handles = session::new_session_map();

    // Crash recovery
    session::recover_sessions(&handles, &pool).await?;

    // Start TTL sweeper
    let sweeper_pool = pool.clone();
    let sweeper_handles = handles.clone();
    tokio::spawn(session::run_ttl_sweeper(sweeper_pool, sweeper_handles));

    // Build application state
    let state = AppState {
        pool,
        handles,
        idempotency_sessions: idempotency::new_cache(
            config::IDEMPOTENCY_TTL,
            config::IDEMPOTENCY_CAPACITY,
        ),
        idempotency_rounds: idempotency::new_cache(
            config::IDEMPOTENCY_TTL,
            config::IDEMPOTENCY_CAPACITY,
        ),
        base_url: config::settings().base_url.clone(),
    };

    // Build router — rate limiter attached only to POST /v1/sessions
    // (DESIGN.md §735). The lib::build_app variant omits the governor layer
    // and is used by integration tests to avoid bucket exhaustion.
    // E2E runs can set GSLEEK_DISABLE_RATE_LIMIT=true to bypass the governor,
    // because the test suite creates sessions far faster than 20/min.
    let disable_rate_limit = std::env::var("GSLEEK_DISABLE_RATE_LIMIT")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);

    let sessions_post = if disable_rate_limit {
        post(handlers::sessions::create_session)
    } else {
        let rate_limit_layer = axum_governor::GovernorLayer::new(
            GovernorConfigBuilder::default()
                .with_extractor(SmartIp::new().with_trusted_proxies([
                    "127.0.0.1/32".parse::<IpNet>().unwrap(),
                ]))
                .expect_connect_info()
                .quota_default(axum_governor::Quota::requests_per_minute(
                    std::num::NonZeroU32::new(config::RATE_LIMIT_PER_MIN).unwrap(),
                ))
                .error_handler(|reason| {
                    let body = serde_json::json!({"message": "rate limited", "status": 429});
                    let mut response = axum::response::Json(body).into_response();
                    if let axum_governor::RejectionReason::QuotaExceeded { wait, .. } = reason {
                        let headers = response.headers_mut();
                        headers.insert(
                            "retry-after",
                            axum::http::HeaderValue::from_str(&wait.as_secs().to_string())
                                .unwrap(),
                        );
                    }
                    *response.status_mut() = StatusCode::TOO_MANY_REQUESTS;
                    response
                })
                .finish()
                .unwrap(),
        );
        post(handlers::sessions::create_session).layer(rate_limit_layer)
    };

    let app = grilling_sleek::apply_middleware(grilling_sleek::assemble_routes(sessions_post))
        .with_state(state);

    // Start server
    let listener = tokio::net::TcpListener::bind(config::LISTEN_ADDR).await?;
    tracing::info!(addr = %config::LISTEN_ADDR, "listening");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    tracing::info!("server shut down");
    // _guard drops here, flushing OTel exporters
    Ok(())
}

// ---------------------------------------------------------------------------
// Graceful shutdown with 30s timeout
// ---------------------------------------------------------------------------

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!(
        "shutdown signal received, draining connections for {:?}",
        config::SHUTDOWN_TIMEOUT
    );

    // After SHUTDOWN_TIMEOUT, force exit
    tokio::spawn(async {
        tokio::time::sleep(config::SHUTDOWN_TIMEOUT).await;
        tracing::warn!("shutdown timeout reached, forcing exit");
        std::process::exit(1);
    });
}
