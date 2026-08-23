//! Runtime configuration and constants.
//!
//! Two coexisting layers:
//! - [`Settings`] — deployment-tunable values loaded via `config-rs` (layered:
//!   defaults → optional TOML file → `GSLEEK_`-prefixed env overrides). Loaded
//!   once at startup into a process-wide singleton ([`init`] / [`settings`]).
//! - `pub const` below — performance/operational constants not yet promoted to
//!   `Settings` (see `specs/configuration.md` for the extraction roadmap).

use serde::Deserialize;
use std::path::PathBuf;
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
    pub db_path: PathBuf,

    /// Log directory (tracing-appender rolling files).
    pub log_dir: PathBuf,

    /// `session_archive` retention window in days. Rows archived longer ago
    /// are purged by the background retention task. `0` disables purging.
    ///
    /// This is the direct knob for the steady-state disk budget: worst-case
    /// archive growth is (abuse write rate) × (this window).
    pub archive_retention_days: u64,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            base_url: "https://grilling-sleek.example.com".into(),
            db_path: PathBuf::from("./data/grilling-sleek.db"),
            log_dir: PathBuf::from("./log/grilling-sleek"),
            archive_retention_days: 7,
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
    SETTINGS
        .set(settings)
        .expect("settings already initialized");
}

/// Access the process-wide settings. Panics if [`init`] was not called.
pub fn settings() -> &'static Settings {
    SETTINGS.get().expect("settings not initialized")
}

// ---------------------------------------------------------------------------
// Hardcoded constants (not yet promoted to Settings)
// ---------------------------------------------------------------------------

/// Listen address (loopback only; Caddy reverse-proxies public traffic).
///
/// Chosen: common dev port; Caddy config is pre-set to proxy to this.
/// Side effects: changing requires a matching Caddy reverse-proxy update.
/// External systems: Caddy reverse proxy.
pub const LISTEN_ADDR: &str = "127.0.0.1:8000";

/// Fixed session TTL in seconds.
///
/// Sessions are not renewed; `expires_at = created_at + SESSION_TTL`.
/// 1 hour balances agent workflow completion time against resource holding.
/// Increasing this raises peak concurrent session count and SQLite WAL size.
///
/// Chosen: 1 h is enough for typical agent workflows while bounding resources.
/// Side effects: increasing raises peak concurrent sessions and SQLite WAL size.
/// External systems: none.
pub const SESSION_TTL: i64 = 3600;

/// SessionHandle map (DashMap) soft capacity limit.
///
/// Sized for ~15k concurrent sessions at ~2 KB per handle (~30 MB peak).
/// The TTL sweeper reaps expired entries, so this is a burst ceiling, not steady-state.
/// Exceeding this returns 503 to new POST /sessions requests.
///
/// Chosen: ~30 MB memory footprint, suitable for medium deployments.
/// Side effects: exceeding returns 503; new session creation fails.
/// External systems: none.
pub const MAX_SESSIONS: usize = 15_000;

/// Global SSE connection soft limit (AtomicU64 counter; guards FD/memory exhaustion).
///
/// Each SSE connection holds one TCP FD + ~4 KB stream buffer.
/// 50k ≈ 200 MB memory + 50k FDs (well below typical ulimit -n 1048576).
/// Exceeding this returns 503 to new SSE requests.
///
/// Chosen: ~200 MB memory + 50k FDs, well under typical ulimit.
/// Side effects: exceeding returns 503; SSE connections rejected.
/// External systems: OS ulimit settings.
pub const MAX_SSE_CONNECTIONS: u64 = 50_000;

/// Single long-poll blocking upper bound in seconds.
///
/// Set to 55s to stay safely under the 60s timeout common in reverse proxies
/// and API gateways (Cloudflare, nginx, Caddy). A 5s margin prevents spurious
/// 502/504 errors from proxy timeout races.
///
/// Chosen: 5 s below the 60 s proxy timeout to avoid race conditions.
/// Side effects: increasing may trigger proxy timeout errors (502/504).
/// External systems: Cloudflare, nginx, Caddy reverse proxies.
pub const LONGPOLL_WAIT: u64 = 55;

/// SSE keepalive interval (axum KeepAlive::interval; under CF Proxy Read Timeout 120s → 524).
///
/// Chosen: 35 s below Cloudflare 120 s timeout for stability.
/// Side effects: decreasing increases network overhead; increasing may trigger 524.
/// External systems: Cloudflare Proxy Read Timeout.
pub const KEEPALIVE_INTERVAL: Duration = Duration::from_secs(85);

/// Graceful shutdown upper bound (systemd TimeoutStopSec=35 > this).
///
/// Chosen: 5 s below systemd default 35 s for graceful shutdown.
/// Side effects: increasing may delay service restarts.
/// External systems: systemd.
pub const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(30);

/// Per-IP create-session rate limit (axum-governor Quota).
///
/// Chosen: prevents single-IP abuse while allowing normal usage.
/// Side effects: decreasing may block legitimate users; increasing may allow abuse.
/// External systems: axum-governor.
pub const RATE_LIMIT_PER_MIN: u32 = 20;

/// Per-IP general rate limit covering every business route (all /v1/* except
/// health probes; POST /v1/sessions additionally keeps the tighter
/// [`RATE_LIMIT_PER_MIN`] inner layer).
///
/// Chosen: legit peak is ~10 req/min/IP (1 long-poll per 55s per session +
/// occasional GETs + one SSE per tab); an office NAT with 5 heavy users sits
/// around 50 req/min — 120 gives 2-6× headroom while capping a bandwidth
/// amplification attack at ~120 × 15 KiB (gzip'd max session) ≈ 0.25 Mbps,
/// safely under a 3 Mbps origin uplink.
/// Side effects: decreasing may throttle NAT'd power users; increasing raises
/// the abuse bandwidth ceiling.
/// External systems: axum-governor.
pub const RATE_LIMIT_GENERAL_PER_MIN: u32 = 120;

/// Archive retention purge cadence.
///
/// Chosen: hourly bounds purge-induced write amplification while keeping the
/// disk steady state within one window of drift.
/// Side effects: decreasing adds idle DELETE scans; increasing delays
/// reclamation after bursts.
/// External systems: none.
pub const RETENTION_INTERVAL: Duration = Duration::from_secs(3600);

/// Archive retention DELETE batch size.
///
/// Chosen: keeps each purge transaction small so WAL autocheckpoint
/// (1000 pages) can truncate between batches instead of growing the WAL by
/// the whole backlog.
/// Side effects: increasing grows WAL spikes; decreasing slows backlog drainage.
/// External systems: SQLite (wal_autocheckpoint).
pub const RETENTION_BATCH: i64 = 500;

/// TTL sweeper scan period.
///
/// Chosen: balances scan frequency against CPU overhead.
/// Side effects: decreasing increases CPU usage; increasing delays expired session cleanup.
/// External systems: none.
pub const SWEEP_INTERVAL: Duration = Duration::from_secs(30);

/// SQLite busy_timeout (write-conflict retry bound).
/// SQLite serializes writers; under contention this bounds how long a request
/// waits on the write lock before failing, keeping tail latency predictable.
///
/// Chosen: 5 s fails fast instead of stacking multi-second lock waits.
/// Side effects: decreasing may cause write failures; increasing adds latency.
/// External systems: SQLite.
pub const BUSY_TIMEOUT: Duration = Duration::from_secs(5);

/// sqlx Pool connection-acquire timeout (sqlx PoolOptions default is 30s).
/// Distinct from the SQLite-layer `BUSY_TIMEOUT`. With a small pool this is
/// the queue bound when all connections are checked out.
///
/// Chosen: 5 s — fails fast while staying above CF's 100 s proxy timeout.
/// Side effects: decreasing may cause connection acquire failures; increasing adds latency.
/// External systems: sqlx.
pub const ACQUIRE_TIMEOUT: Duration = Duration::from_secs(5);

/// Idempotency cache entry TTL (moka TTL).
///
/// Chosen: 5 min covers the typical request retry window.
/// Side effects: decreasing may break idempotency; increasing uses more memory.
/// External systems: moka cache.
pub const IDEMPOTENCY_TTL: Duration = Duration::from_secs(300);

/// Idempotency cache max capacity (moka TinyLFU eviction).
///
/// Chosen: ~10k entries with controllable memory footprint.
/// Side effects: decreasing causes frequent evictions; increasing uses more memory.
/// External systems: moka cache.
pub const IDEMPOTENCY_CAPACITY: u64 = 10_000;

/// SQLite pool maximum connections.
/// SQLite writers serialize anyway; each extra connection costs its own page
/// cache (see `SQLITE_CACHE_SIZE`), so pool × cache is the memory budget.
///
/// Chosen: 8 × 16 MiB = 128 MiB worst-case page cache, fits a 2 GiB host.
/// Side effects: decreasing limits read concurrency; increasing multiplies
/// the page-cache memory budget.
/// External systems: SQLite.
pub const DB_POOL_MAX: u32 = 8;

/// SQLite pool minimum idle connections.
/// Keeps a warm floor to avoid cold-start latency on low-traffic periods.
///
/// Chosen: 2 connections cover one writer + one reader at idle.
/// Side effects: decreasing increases cold-start latency; increasing wastes resources.
/// External systems: SQLite.
pub const DB_POOL_MIN: u32 = 2;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn archive_retention_defaults_to_seven_days() {
        assert_eq!(Settings::default().archive_retention_days, 7);
    }
}
