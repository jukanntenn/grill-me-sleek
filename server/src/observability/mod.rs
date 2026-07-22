use opentelemetry::trace::TracerProvider as _;
use opentelemetry_appender_tracing::layer::OpenTelemetryTracingBridge;
use opentelemetry_otlp::WithExportConfig as _;
use opentelemetry_sdk::Resource;
use opentelemetry_sdk::logs::SdkLoggerProvider;
use opentelemetry_sdk::metrics::SdkMeterProvider;
use opentelemetry_sdk::trace::SdkTracerProvider;
use std::sync::OnceLock;
use tracing_appender::rolling;
use tracing_subscriber::filter::EnvFilter;
use tracing_subscriber::fmt;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

/// Shared OTel Resource identifying this service (DESIGN.md §2278).
fn service_resource() -> Resource {
    Resource::builder()
        .with_service_name("grilling-sleek")
        .build()
}

/// Global meter provider for custom metrics.
static METER_PROVIDER: OnceLock<SdkMeterProvider> = OnceLock::new();

/// Initialize tracing with JSON file output + optional OTLP export.
///
/// Returns a guard that must be dropped before shutdown to flush buffered logs.
pub fn init_tracing(log_dir: &std::path::Path) -> TracingGuard {
    // Rolling file appenders (daily rotation, four files per design):
    //   app     — tracing logs (business/operational events)
    //   traces  — tracing-fmt span events AND real OTel span records (otel:true)
    //   metrics — tracing-fmt events AND real OTel metric snapshots (otel:true)
    //   logs    — real OTel log records (otel:true)
    let log_dir = log_dir.to_path_buf();
    let app_appender = rolling::daily(&log_dir, "app");
    let traces_appender = rolling::daily(&log_dir, "traces");
    let metrics_appender = rolling::daily(&log_dir, "metrics");
    let logs_appender = rolling::daily(&log_dir, "logs");

    let (app_writer, app_guard) = tracing_appender::non_blocking(app_appender);
    let (traces_writer, traces_guard) = tracing_appender::non_blocking(traces_appender);
    let (metrics_writer, metrics_guard) = tracing_appender::non_blocking(metrics_appender);
    let (logs_writer, logs_guard) = tracing_appender::non_blocking(logs_appender);

    // JSON file layers
    let app_layer = fmt::layer()
        .json()
        .with_writer(app_writer.clone())
        .with_ansi(false);

    let traces_layer = fmt::layer()
        .json()
        .with_writer(traces_writer.clone())
        .with_ansi(false);

    let metrics_layer = fmt::layer()
        .json()
        .with_writer(metrics_writer.clone())
        .with_ansi(false);

    // Console (stderr) layer for local development — a human-readable, ANSI-
    // colored view in addition to (not replacing) the JSON file layers and the
    // optional OTel exporters. Writes to stderr so it never interleaves with a
    // potential stdout consumer; ANSI colors auto-detected from the TTY.
    let console_layer = fmt::layer()
        .with_writer(std::io::stderr)
        .with_target(true)
        .with_thread_ids(false)
        .with_thread_names(false)
        .with_file(false)
        .with_line_number(false);

    // Env filter
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    // OTel providers: OTLP when OTEL_EXPORTER_OTLP_ENDPOINT is set (production),
    // otherwise local file exporters (clone the same NonBlocking writers so the
    // OTel output shares the fmt layer's worker thread — no interleaving, and
    // the otel:true tag distinguishes OTel records from fmt event lines).
    let otel_trace_provider = init_otel_traces(Some(traces_writer));
    let otel_log_provider = init_otel_logs(Some(logs_writer));
    let meter_provider = init_otel_metrics(Some(metrics_writer));

    // Build subscriber — use Option<Layer> to handle conditional OTel layers
    let otel_trace_layer = otel_trace_provider.as_ref().map(|provider| {
        tracing_opentelemetry::layer().with_tracer(provider.tracer("grilling-sleek"))
    });

    let otel_log_layer = otel_log_provider
        .as_ref()
        .map(OpenTelemetryTracingBridge::new);

    tracing_subscriber::registry()
        .with(env_filter)
        .with(app_layer)
        .with(traces_layer)
        .with(metrics_layer)
        .with(console_layer)
        .with(otel_trace_layer)
        .with(otel_log_layer)
        .init();

    // Register the meter provider both in our OnceLock (for `metrics()` lookups)
    // and as the global OTel meter provider — `init_metrics()` (called from
    // main.rs after this) creates instruments via `opentelemetry::global::meter`,
    // so the global must be set first or all `counter.add()` calls hit a no-op.
    let _ = METER_PROVIDER.set(meter_provider.clone());
    opentelemetry::global::set_meter_provider(meter_provider.clone());

    TracingGuard {
        _app_guard: app_guard,
        _traces_guard: traces_guard,
        _metrics_guard: metrics_guard,
        _logs_guard: logs_guard,
        otel_trace_provider,
        otel_log_provider,
        meter_provider,
    }
}

/// Initialize OTLP trace exporter.
///
/// When `OTEL_EXPORTER_OTLP_ENDPOINT` is set (production), an OTLP exporter is
/// built. Otherwise (local development), a [`FileSpanExporter`] is built on the
/// shared `traces` rolling-file writer — so real OTel span data lands in
/// `traces.*` alongside the tracing-fmt event lines (tagged `otel:true`).
fn init_otel_traces(
    traces_writer: Option<tracing_appender::non_blocking::NonBlocking>,
) -> Option<SdkTracerProvider> {
    if let Ok(endpoint) = std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT") {
        let exporter = opentelemetry_otlp::SpanExporter::builder()
            .with_tonic()
            .with_endpoint(&endpoint)
            .build()
            .ok()?;

        let provider = SdkTracerProvider::builder()
            .with_batch_exporter(exporter)
            .with_resource(service_resource())
            .build();

        return Some(provider);
    }

    // Local-development fallback: file exporter.
    let writer = traces_writer?;
    let exporter = exporters::FileSpanExporter::new(writer);
    let provider = SdkTracerProvider::builder()
        .with_simple_exporter(exporter)
        .with_resource(service_resource())
        .build();
    Some(provider)
}

/// Initialize OTLP log exporter.
///
/// Same OTLP-vs-file branching as [`init_otel_traces`], writing to a dedicated
/// `logs` rolling file (new — there is no existing fmt layer for OTel logs).
fn init_otel_logs(
    logs_writer: Option<tracing_appender::non_blocking::NonBlocking>,
) -> Option<SdkLoggerProvider> {
    if let Ok(endpoint) = std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT") {
        let exporter = opentelemetry_otlp::LogExporter::builder()
            .with_tonic()
            .with_endpoint(&endpoint)
            .build()
            .ok()?;

        let provider = SdkLoggerProvider::builder()
            .with_batch_exporter(exporter)
            .with_resource(service_resource())
            .build();

        return Some(provider);
    }

    // Local-development fallback: file exporter.
    let writer = logs_writer?;
    let exporter = exporters::FileLogExporter::new(writer);
    let provider = SdkLoggerProvider::builder()
        .with_simple_exporter(exporter)
        .with_resource(service_resource())
        .build();
    Some(provider)
}

/// Initialize OTLP metric exporter.
///
/// Same OTLP-vs-file branching. The file exporter is driven by the default
/// `PeriodicReader` (60s export interval); aggregated metric snapshots land in
/// `metrics.*` alongside the tracing-fmt event lines.
fn init_otel_metrics(
    metrics_writer: Option<tracing_appender::non_blocking::NonBlocking>,
) -> SdkMeterProvider {
    let builder = SdkMeterProvider::builder().with_resource(service_resource());

    if let Ok(endpoint) = std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT") {
        if let Ok(exporter) = opentelemetry_otlp::MetricExporter::builder()
            .with_tonic()
            .with_endpoint(&endpoint)
            .build()
        {
            return builder.with_periodic_exporter(exporter).build();
        }
    }

    // Local-development fallback: file exporter (driven by PeriodicReader).
    if let Some(writer) = metrics_writer {
        let exporter = exporters::FileMetricExporter::new(writer);
        return builder.with_periodic_exporter(exporter).build();
    }

    // No writer available — no-op provider (no reader = nothing exported).
    builder.build()
}

/// Get the global meter provider.
pub fn meter_provider() -> Option<&'static SdkMeterProvider> {
    METER_PROVIDER.get()
}

/// Business metrics module.
pub mod metrics;

/// Local-file OTel exporters (traces/metrics/logs) for local development.
pub mod exporters;

/// Guard that flushes OTel providers on drop.
pub struct TracingGuard {
    _app_guard: tracing_appender::non_blocking::WorkerGuard,
    _traces_guard: tracing_appender::non_blocking::WorkerGuard,
    _metrics_guard: tracing_appender::non_blocking::WorkerGuard,
    _logs_guard: tracing_appender::non_blocking::WorkerGuard,
    otel_trace_provider: Option<SdkTracerProvider>,
    otel_log_provider: Option<SdkLoggerProvider>,
    meter_provider: SdkMeterProvider,
}

impl Drop for TracingGuard {
    fn drop(&mut self) {
        if let Some(ref provider) = self.otel_trace_provider {
            let _ = provider.shutdown();
        }
        if let Some(ref provider) = self.otel_log_provider {
            let _ = provider.shutdown();
        }
        let _ = self.meter_provider.shutdown();
    }
}
