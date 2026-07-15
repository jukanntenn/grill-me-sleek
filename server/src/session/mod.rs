use dashmap::DashMap;
use sqlx::{Pool, Sqlite};
use std::sync::Arc;
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

use crate::config;
use crate::db;
use crate::models::SessionStatus;
use crate::sse::SseHub;

// Re-export the constants used by handlers, anchored in `config`.
pub use config::{MAX_SESSIONS, SESSION_TTL, SWEEP_INTERVAL};

/// SessionHandle: per-active-session in-memory handle.
///
/// Holds only runtime coordination primitives — no business data.
/// Business data lives in SQLite; this handle is rebuilt on crash recovery.
pub struct SessionHandle {
    pub id: String,

    /// Long-poll wakeup signal. Pure notification, no payload.
    /// User submits response → agent_notify.notify_waiters() → blocked
    /// long-poll tasks wake up and re-query DB for the answer.
    pub agent_notify: Arc<Notify>,

    /// SSE hub for broadcasting events to browser clients.
    pub sse_hub: Arc<SseHub>,

    /// Cancellation token for terminal state transitions.
    /// When session enters completed/cancelled/expired, cancel() is called
    /// to interrupt all pending long-poll tasks.
    pub cancel_token: CancellationToken,
}

impl SessionHandle {
    pub fn new(id: String) -> Self {
        Self {
            id,
            agent_notify: Arc::new(Notify::new()),
            sse_hub: Arc::new(SseHub::new(8)),
            cancel_token: CancellationToken::new(),
        }
    }
}

/// Session handle map. Only active sessions have entries.
pub type SessionMap = Arc<DashMap<String, Arc<SessionHandle>>>;

/// Create a new empty session map.
pub fn new_session_map() -> SessionMap {
    Arc::new(DashMap::new())
}

/// Register a new session handle.
/// Returns Err if MAX_SESSIONS is reached (best-effort soft limit).
pub fn register_session(map: &SessionMap, session_id: String) -> bool {
    if map.len() >= MAX_SESSIONS {
        return false;
    }
    map.insert(
        session_id.clone(),
        Arc::new(SessionHandle::new(session_id)),
    );
    true
}

/// Remove a session handle and signal its cancellation.
pub fn remove_session(map: &SessionMap, session_id: &str) {
    if let Some((_, handle)) = map.remove(session_id) {
        handle.cancel_token.cancel();
        handle.agent_notify.notify_waiters();
    }
}

/// Crash recovery: rebuild SessionHandles for all active sessions.
pub async fn recover_sessions(map: &SessionMap, pool: &Pool<Sqlite>) -> anyhow::Result<usize> {
    let now = time_now();
    let active_ids = db::find_active_sessions(pool, now).await?;
    let count = active_ids.len();

    for id in active_ids {
        register_session(map, id);
    }

    // Initialize the active sessions gauge
    crate::observability::metrics::ACTIVE_SESSIONS
        .store(count as i64, std::sync::atomic::Ordering::Relaxed);
    if let Some(m) = crate::observability::metrics::metrics() {
        m.sessions_active.record(count as u64, &[]);
    }

    tracing::info!(count, "recovered active sessions");
    Ok(count)
}

/// TTL sweeper background task.
///
/// Scans for expired sessions every SWEEP_INTERVAL seconds and archives them.
pub async fn run_ttl_sweeper(pool: Pool<Sqlite>, map: SessionMap) {
    let mut interval = tokio::time::interval(config::SWEEP_INTERVAL);

    loop {
        interval.tick().await;
        let now = time_now();

        match db::find_expired_sessions(&pool, now).await {
            Ok(expired_ids) => {
                for session_id in expired_ids {
                    tracing::info!(session_id = %session_id, "sweeping expired session");

                    // Broadcast expired event before removing
                    if let Some(handle) = map.get(&session_id) {
                        handle
                            .sse_hub
                            .broadcast(crate::sse::SseEvent::session_expired(&session_id));
                    }

                    // Remove from handle map
                    remove_session(&map, &session_id);

                    // Archive in DB
                    match db::archive_session(
                        &pool,
                        &session_id,
                        SessionStatus::Expired as i64,
                        now,
                    )
                    .await {
                        Ok(true) => {
                            if let Some(m) = crate::observability::metrics::metrics() {
                                m.ttl_swept_total.add(1, &[]);
                                let active = crate::observability::metrics::ACTIVE_SESSIONS
                                    .fetch_sub(1, std::sync::atomic::Ordering::Relaxed)
                                    - 1;
                                m.sessions_active.record(active as u64, &[]);
                            }
                            tracing::info!(session_id = %session_id, "archived expired session");
                        }
                        Ok(false) => {
                            // Already gone (concurrent archive)
                        }
                        Err(e) => {
                            tracing::error!(
                                session_id = %session_id,
                                error = %e,
                                "failed to archive expired session"
                            );
                        }
                    }
                }
            }
            Err(e) => {
                tracing::error!(error = %e, "sweeper: failed to find expired sessions");
            }
        }
    }
}

/// Get current Unix timestamp in seconds.
pub fn time_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

/// Convert Unix seconds to RFC 3339 string.
pub fn unix_to_rfc3339(unix_secs: i64) -> String {
    let dt = time::OffsetDateTime::UNIX_EPOCH + time::Duration::seconds(unix_secs);
    dt.format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| format!("{}+00:00", unix_secs))
}

/// Generate a session ID: 128-bit CSPRNG, base64url encoded (~22 chars).
/// Ensures the first character is alphanumeric (not `-` or `_`) for CLI compatibility.
pub fn generate_session_id() -> String {
    let mut buf = [0u8; 16];
    getrandom::fill(&mut buf).expect("getrandom failed");
    let mut id = base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, buf);
    // Ensure first char is not `-` or `_` (breaks CLI argument parsing)
    if id.starts_with('-') || id.starts_with('_') {
        id.replace_range(0..1, "s");
    }
    id
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_id_format() {
        let id = generate_session_id();
        assert_eq!(id.len(), 22); // 16 bytes -> 22 base64url chars (no padding)
        assert!(!id.contains('+'));
        assert!(!id.contains('/'));
        assert!(!id.contains('='));
    }

    #[test]
    fn session_id_no_dash_or_underscore_prefix() {
        // Verify that session IDs never start with `-` or `_` which break CLI parsing.
        // Run multiple times to increase confidence (base64url has ~3% chance of `-`/`_` first char).
        for _ in 0..100 {
            let id = generate_session_id();
            assert!(
                !id.starts_with('-') && !id.starts_with('_'),
                "session_id must not start with - or _, got: {}",
                id
            );
        }
    }

    #[test]
    fn session_id_unique() {
        let id1 = generate_session_id();
        let id2 = generate_session_id();
        assert_ne!(id1, id2);
    }

    #[test]
    fn unix_to_rfc3339_basic() {
        let s = unix_to_rfc3339(0);
        assert_eq!(s, "1970-01-01T00:00:00Z");
    }

    #[test]
    fn unix_to_rfc3339_recent() {
        let s = unix_to_rfc3339(1720000000);
        assert!(s.starts_with("2024-07-03"));
    }

    #[test]
    fn time_now_is_reasonable() {
        let now = time_now();
        assert!(now > 1700000000); // after 2023
        assert!(now < 2000000000); // before 2033
    }

    #[test]
    fn session_handle_new() {
        let handle = SessionHandle::new("test-id".to_string());
        assert_eq!(handle.id, "test-id");
        assert!(!handle.cancel_token.is_cancelled());
    }

    #[test]
    fn session_map_register_and_remove() {
        let map = new_session_map();
        assert!(register_session(&map, "s1".to_string()));
        assert!(map.contains_key("s1"));
        assert_eq!(map.len(), 1);

        remove_session(&map, "s1");
        assert!(!map.contains_key("s1"));
        assert_eq!(map.len(), 0);
    }
}
