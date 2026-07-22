//! SSE event stream handler.
//!
//! DESIGN.md §737-806 — per-session SSE with:
//!   - `broadcast::channel(8)` hub (slow consumers drop via `Lagged`, compensated
//!     by GET current on reconnect);
//!   - axum-native `KeepAlive` at 85s (under CF Proxy Read Timeout 120s → 524);
//!   - a global `MAX_SSE_CONNECTIONS` soft limit via an `AtomicU64` counter.
//!
//! # RAII connection guard (DESIGN.md §755-779)
//!
//! The decrement MUST fire on every drop path (client disconnect, connection
//! timeout, server-initiated close, tokio task abort, panic unwind). To
//! guarantee this, the guard is moved INTO the SSE stream as a field of a
//! `GuardedStream` newtype. axum's `Sse::new(stream)` stores the stream inside
//! the response body; when the body is dropped (connection end), the stream
//! drops, and its `_guard` field drops last → `fetch_sub(1)` runs. A guard
//! living on the handler stack would be dropped when the handler returns (long
//! before the stream ends) — that was the original bug.

use std::convert::Infallible;
use std::pin::Pin;
use std::sync::atomic::{AtomicU64, Ordering};
use std::task::{Context, Poll};

use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::response::sse::{Event, KeepAlive, Sse};
use futures::Stream;
use tokio_stream::StreamExt;
use tokio_stream::wrappers::BroadcastStream;

use crate::AppState;
use crate::config;
use crate::models::{ErrorResponse, GoneResponse};
use crate::observability::metrics::metrics;

/// Global SSE connection counter for the soft limit.
static SSE_ACTIVE: AtomicU64 = AtomicU64::new(0);

/// RAII guard: increments on creation, decrements on drop.
struct SseConnGuard {
    counter: &'static AtomicU64,
}

impl SseConnGuard {
    fn acquire() -> Option<Self> {
        // fetch_add then check; if over the limit, roll back and refuse.
        // TOCTOU here is acceptable — DESIGN.md §755 explicitly tolerates a
        // best-effort soft limit (a couple of connections over is harmless).
        let prev = SSE_ACTIVE.fetch_add(1, Ordering::Relaxed);
        if prev >= config::MAX_SSE_CONNECTIONS {
            SSE_ACTIVE.fetch_sub(1, Ordering::Relaxed);
            None
        } else {
            Some(SseConnGuard {
                counter: &SSE_ACTIVE,
            })
        }
    }
}

impl Drop for SseConnGuard {
    fn drop(&mut self) {
        let prev = self.counter.fetch_sub(1, Ordering::Relaxed);
        // Record the updated gauge (connections still active).
        if let Some(m) = metrics() {
            m.sse_connections_active.record(prev - 1, &[]);
        }
    }
}

/// A stream newtype that owns the connection guard. Moving the guard into the
/// stream (rather than the handler stack) ensures it drops only when the SSE
/// body is dropped — i.e. when the connection truly ends.
struct GuardedStream<S> {
    inner: S,
    _guard: SseConnGuard,
}

impl<S> Stream for GuardedStream<S>
where
    S: Stream<Item = Result<Event, Infallible>> + Unpin,
{
    type Item = Result<Event, Infallible>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        Pin::new(&mut this.inner).poll_next(cx)
    }
}

/// GET /v1/sessions/{session_id}/events — SSE event stream.
#[utoipa::path(
    get,
    path = "/v1/sessions/{session_id}/events",
    tag = "sse",
    params(
        ("session_id" = String, Path, description = "Session identifier")
    ),
    responses(
        (status = 200, description = "SSE event stream (text/event-stream)"),
        (status = 404, description = "Session not found", body = ErrorResponse),
        (status = 410, description = "Session gone (terminal state)", body = GoneResponse),
        (status = 503, description = "Max SSE connections reached")
    )
)]
pub async fn sse_handler(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> Result<axum::response::Response, axum::http::StatusCode> {
    // Verify session exists and is active.
    let _row = crate::db::get_session_or_gone(&state.pool, &session_id)
        .await
        .map_err(|_| axum::http::StatusCode::NOT_FOUND)?;

    // Acquire a connection slot; refuse with 503 if the global limit is hit.
    let guard = SseConnGuard::acquire().ok_or(axum::http::StatusCode::SERVICE_UNAVAILABLE)?;
    if let Some(m) = metrics() {
        m.sse_connections_active
            .record(SSE_ACTIVE.load(Ordering::Relaxed), &[]);
    }

    // Subscribe to the per-session broadcast hub.
    let handle = state
        .handles
        .get(&session_id)
        .ok_or(axum::http::StatusCode::NOT_FOUND)?
        .clone();
    let rx = handle.sse_hub.subscribe();

    // Convert the broadcast receiver into a stream of SSE Events. Lagged
    // receivers (slow Tab) skip the missed event — they'll GET current on
    // reconnect to compensate (DESIGN.md §801-806, §810-818).
    let inner = BroadcastStream::new(rx).filter_map(|result| match result {
        Ok(sse_event) => {
            let event = Event::default()
                .event(&sse_event.event)
                .json_data(&sse_event.data)
                .unwrap_or_default();
            Some(Ok::<_, Infallible>(event))
        }
        Err(_) => None, // Lagged — skip
    });

    // Move the guard into the stream so it drops with the connection body.
    let guarded = GuardedStream {
        inner,
        _guard: guard,
    };

    // Keepalive at 85s (under CF Proxy Read Timeout 120s → 524).
    let keepalive = KeepAlive::new().interval(config::KEEPALIVE_INTERVAL);

    Ok(Sse::new(guarded).keep_alive(keepalive).into_response())
}

/// Get the current SSE connection count (for diagnostics).
pub fn sse_active_count() -> u64 {
    SSE_ACTIVE.load(Ordering::Relaxed)
}
