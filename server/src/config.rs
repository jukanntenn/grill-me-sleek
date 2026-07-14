//! Runtime configuration and constants.
//!
//! Two coexisting layers:
//! - [`Settings`] — deployment-tunable values loaded via `config-rs` (layered:
//!   defaults → optional TOML file → `GSLEEK_`-prefixed env overrides). Loaded
//!   once at startup into a process-wide singleton ([`init`] / [`settings`]).
//! - `pub const` below — performance/operational constants not yet promoted to
//!   `Settings` (see `specs/configuration.md` for the extraction roadmap).

use serde::Deserialize;
use std::sync::OnceLock;
use std::time::Duration;

// ---------------------------------------------------------------------------
// Layered configuration (config-rs)
// ---------------------------------------------------------------------------

/// Deployment-tunable settings, loaded from defaults → TOML file → env.
///
/// Env var naming: `GSLEEK_` prefix + field name uppercased with `_`
/// (e.g. `GSLEEK_BASE_URL`). config-rs strips the prefix and lowercases the
/// remainder, yielding the struct field name directly.
#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct Settings {
    /// Base URL for session links (`{base_url}/#{session_id}`).
    pub base_url: String,

    /// SQLite database file path.
    pub db_path: String,

    /// Log directory (tracing-appender rolling files).
    pub log_dir: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            base_url: "https://grilling-sleek.example.com".into(),
            db_path: "./data/grilling-sleek.db".into(),
            log_dir: "./log/grilling-sleek".into(),
        }
    }
}

impl Settings {
    /// Load layered configuration: defaults ← optional TOML file ← `GSLEEK_` env.
    ///
    /// The TOML file path is taken from the `GSLEEK_CONFIG_FILE` env var; when
    /// unset, only defaults + env are used (no file). Missing env vars fall
    /// back to [`Default`] via `#[serde(default)]`.
    pub fn load() -> anyhow::Result<Self> {
        let mut builder = config::Config::builder().add_source(
            config::Environment::with_prefix("GSLEEK")
                .try_parsing(true)
                .ignore_empty(true),
        );

        if let Ok(path) = std::env::var("GSLEEK_CONFIG_FILE") {
            builder = builder.add_source(config::File::with_name(&path).required(true));
        }

        Ok(builder.build()?.try_deserialize()?)
    }
}

static SETTINGS: OnceLock<Settings> = OnceLock::new();

/// Install the process-wide settings singleton. Called once from `main()`.
pub fn init(settings: Settings) {
    SETTINGS.set(settings).expect("settings already initialized");
}

/// Access the process-wide settings. Panics if [`init`] was not called.
pub fn settings() -> &'static Settings {
    SETTINGS.get().expect("settings not initialized")
}

// ---------------------------------------------------------------------------
// Hardcoded constants (not yet promoted to Settings)
// ---------------------------------------------------------------------------

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
