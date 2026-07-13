//! All runtime constants (per DESIGN.md §2383-2398).
//!
//! Most parameters are hardcoded constants. Three values accept `GS_`-prefixed
//! env var overrides for deployment flexibility: `GS_BASE_URL`, `GS_DB_PATH`,
//! `GS_LOG_DIR`.

use std::time::Duration;

/// Listen address (loopback only; Caddy reverse-proxies public traffic).
pub const LISTEN_ADDR: &str = "127.0.0.1:8080";

/// Fixed session TTL in seconds (no renewal; `expires_at = created_at + SESSION_TTL`).
pub const SESSION_TTL: i64 = 3600;

/// SessionHandle map (DashMap) soft capacity limit.
pub const MAX_SESSIONS: usize = 15_000;

/// Global SSE connection soft limit (AtomicU64 counter; guards FD/memory exhaustion).
pub const MAX_SSE_CONNECTIONS: u64 = 50_000;

/// Single long-poll blocking upper bound (avoids proxy/gateway 60s timeouts).
pub const LONGPOLL_WAIT: u64 = 55;

/// SSE keepalive interval (axum KeepAlive::interval; under CF Proxy Read Timeout 120s → 524).
pub const KEEPALIVE_INTERVAL: Duration = Duration::from_secs(85);

/// Graceful shutdown upper bound (systemd TimeoutStopSec=35 > this).
pub const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(30);

/// Per-IP create-session rate limit (axum-governor Quota).
pub const RATE_LIMIT_PER_MIN: u32 = 20;

/// TTL sweeper scan period.
pub const SWEEP_INTERVAL: Duration = Duration::from_secs(30);

/// SQLite busy_timeout (write-conflict retry bound).
pub const BUSY_TIMEOUT: Duration = Duration::from_secs(5);

/// sqlx Pool connection-acquire timeout (sqlx PoolOptions default is 30s; must be set to 5s).
/// Distinct from the SQLite-layer `BUSY_TIMEOUT`.
pub const ACQUIRE_TIMEOUT: Duration = Duration::from_secs(5);

/// Idempotency cache entry TTL (moka TTL).
pub const IDEMPOTENCY_TTL: Duration = Duration::from_secs(300);

/// Idempotency cache max capacity (moka TinyLFU eviction).
pub const IDEMPOTENCY_CAPACITY: u64 = 10_000;

/// SQLite database file path (env `GS_DB_PATH` overrides).
pub fn db_path() -> String {
    std::env::var("GS_DB_PATH").unwrap_or_else(|_| "./data/grilling-sleek.db".into())
}

/// Log directory (tracing-appender rolling files; env `GS_LOG_DIR` overrides).
pub fn log_dir() -> String {
    std::env::var("GS_LOG_DIR").unwrap_or_else(|_| "./log/grilling-sleek".into())
}

/// Base URL for session links (`{base_url}/#{session_id}`; env `GS_BASE_URL` overrides).
pub fn base_url() -> String {
    std::env::var("GS_BASE_URL").unwrap_or_else(|_| "https://grilling-sleek.example.com".into())
}
