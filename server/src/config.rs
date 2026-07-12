//! All hardcoded runtime constants (per DESIGN.md §2383-2398).
//!
//! Server-side parameters are fully hardcoded — no runtime configuration.
//! (CLI-side parameters use `GS_`-prefixed env vars, not defined here.)

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

/// SQLite database file path.
pub const DB_PATH: &str = "./data/grilling-sleek.db";

/// Log directory (tracing-appender rolling files).
pub const LOG_DIR: &str = "./log/grilling-sleek";

/// Base URL for session links (`{BASE_URL}/#{session_id}`).
pub const BASE_URL: &str = "https://grilling-sleek.example.com";
