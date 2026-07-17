use opentelemetry::metrics::{Counter, Gauge, Histogram};
use std::sync::OnceLock;
use std::sync::atomic::AtomicI64;

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
