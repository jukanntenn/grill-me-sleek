use opentelemetry::metrics::{Counter, Gauge, Histogram};
use std::sync::OnceLock;
use std::sync::atomic::{AtomicI64, Ordering};

/// Atomic counter for active sessions. Handlers update this and set the gauge.
pub static ACTIVE_SESSIONS: AtomicI64 = AtomicI64::new(0);

/// Business metrics as defined in the design.
/// All names have no prefix (single service, OTel/Prom convention).
pub struct Metrics {
    pub sessions_active: Gauge<u64>,
    pub sessions_created_total: Counter<u64>,
    pub sessions_rejected_total: Counter<u64>,
    pub rounds_created_total: Counter<u64>,
    pub responses_received_total: Counter<u64>,
    pub longpoll_wait_seconds: Histogram<f64>,
    pub sse_connections_active: Gauge<u64>,
    pub ttl_swept_total: Counter<u64>,
    pub http_request_duration_seconds: Histogram<f64>,
}

static METRICS: OnceLock<Metrics> = OnceLock::new();

/// Initialize business metrics from the global meter provider.
pub fn init_metrics() {
    let meter = opentelemetry::global::meter("grilling-sleek");

    let sessions_active = meter
        .u64_gauge("sessions_active")
        .with_description("Current active sessions")
        .build();

    let sessions_created_total = meter
        .u64_counter("sessions_created_total")
        .with_description("Total sessions created")
        .build();

    let sessions_rejected_total = meter
        .u64_counter("sessions_rejected_total")
        .with_description("Total session creation rejections")
        .build();

    let rounds_created_total = meter
        .u64_counter("rounds_created_total")
        .with_description("Total rounds created")
        .build();

    let responses_received_total = meter
        .u64_counter("responses_received_total")
        .with_description("Total responses received")
        .build();

    let longpoll_wait_seconds = meter
        .f64_histogram("longpoll_wait_seconds")
        .with_description("Long-poll wait duration in seconds")
        .build();

    let sse_connections_active = meter
        .u64_gauge("sse_connections_active")
        .with_description("Current active SSE connections")
        .build();

    let ttl_swept_total = meter
        .u64_counter("ttl_swept_total")
        .with_description("Total sessions swept by TTL")
        .build();

    let http_request_duration_seconds = meter
        .f64_histogram("http_request_duration_seconds")
        .with_description("HTTP request processing duration in seconds")
        .build();

    let _ = METRICS.set(Metrics {
        sessions_active,
        sessions_created_total,
        sessions_rejected_total,
        rounds_created_total,
        responses_received_total,
        longpoll_wait_seconds,
        sse_connections_active,
        ttl_swept_total,
        http_request_duration_seconds,
    });
}

/// Get the global metrics instance.
pub fn metrics() -> Option<&'static Metrics> {
    METRICS.get()
}

// ---------------------------------------------------------------------------
// Domain-specific helpers
// ---------------------------------------------------------------------------

/// Record a session creation: increment the created counter and bump the
/// active-sessions gauge.
pub fn record_session_created() {
    if let Some(m) = metrics() {
        m.sessions_created_total.add(1, &[]);
        let active = ACTIVE_SESSIONS.fetch_add(1, Ordering::Relaxed) + 1;
        m.sessions_active.record(active as u64, &[]);
    }
}

/// Record a session removal (archive / expiry): decrement the active-sessions
/// gauge.
pub fn record_session_removed() {
    if let Some(m) = metrics() {
        let active = ACTIVE_SESSIONS.fetch_sub(1, Ordering::Relaxed) - 1;
        m.sessions_active.record(active as u64, &[]);
    }
}

/// Record a round creation.
pub fn record_round_created() {
    if let Some(m) = metrics() {
        m.rounds_created_total.add(1, &[]);
    }
}

/// Record a response submission.
pub fn record_response_received() {
    if let Some(m) = metrics() {
        m.responses_received_total.add(1, &[]);
    }
}

/// Record long-poll wait duration.
pub fn record_longpoll_duration(elapsed: f64) {
    if let Some(m) = metrics() {
        m.longpoll_wait_seconds.record(elapsed, &[]);
    }
}

/// Record SSE connection count.
pub fn record_sse_connections(count: u64) {
    if let Some(m) = metrics() {
        m.sse_connections_active.record(count, &[]);
    }
}

/// Record TTL swept sessions.
pub fn record_ttl_swept() {
    if let Some(m) = metrics() {
        m.ttl_swept_total.add(1, &[]);
    }
}

/// Record HTTP request duration.
///
/// Accepts `status: u16` to avoid allocating a `String` in the hot-path
/// middleware; formatting is deferred to this function.
pub fn record_http_duration(elapsed: f64, method: &str, path: &str, status: u16) {
    if let Some(m) = metrics() {
        m.http_request_duration_seconds.record(
            elapsed,
            &[
                opentelemetry::KeyValue::new("method", method.to_string()),
                opentelemetry::KeyValue::new("path", path.to_string()),
                opentelemetry::KeyValue::new("status", status.to_string()),
            ],
        );
    }
}
