use serde::Serialize;
use tokio::sync::broadcast;

/// SSE event types that can be broadcast to clients.
#[derive(Debug, Clone, Serialize)]
pub struct SseEvent {
    pub event: &'static str,
    pub data: serde_json::Value,
}

/// Per-session SSE hub backed by a tokio broadcast channel.
///
/// Each subscriber gets their own `broadcast::Receiver`. Slow consumers
/// receive `RecvError::Lagged` and can compensate via GET current.
pub struct SseHub {
    tx: broadcast::Sender<SseEvent>,
}

impl SseHub {
    /// Create a new hub with the given channel capacity.
    pub fn new(capacity: usize) -> Self {
        let (tx, _) = broadcast::channel(capacity);
        Self { tx }
    }

    /// Broadcast an event to all subscribers. Returns Err only if there
    /// are no receivers (which is fine — SSE is best-effort).
    pub fn broadcast(&self, event: SseEvent) {
        let _ = self.tx.send(event);
    }

    /// Subscribe to this hub. Returns a receiver that will get all
    /// future events.
    pub fn subscribe(&self) -> broadcast::Receiver<SseEvent> {
        self.tx.subscribe()
    }
}

/// Convenience constructors for common SSE events.
impl SseEvent {
    pub fn round_created(round: i64) -> Self {
        Self {
            event: "round.created",
            data: serde_json::json!({ "round": round }),
        }
    }

    pub fn response_created(round: i64) -> Self {
        Self {
            event: "response.created",
            data: serde_json::json!({ "round": round }),
        }
    }

    pub fn session_completed(session_id: &str) -> Self {
        Self {
            event: "session.completed",
            data: serde_json::json!({ "session_id": session_id }),
        }
    }

    pub fn session_cancelled(session_id: &str, reason: &str) -> Self {
        Self {
            event: "session.cancelled",
            data: serde_json::json!({ "session_id": session_id, "reason": reason }),
        }
    }

    pub fn session_expired(session_id: &str) -> Self {
        Self {
            event: "session.expired",
            data: serde_json::json!({ "session_id": session_id }),
        }
    }
}
