# Configuration spec

English | [中文](configuration.zh.md)

The server's runtime configuration system, built on **config-rs** (0.15) for layered configuration in place of hand-written `std::env::var` logic.

## Layered model

Sources merge from lowest to highest priority; a later source overrides an earlier one:

```
默认值（Settings::default）
  └─ TOML 文件（GSLEEK_CONFIG_FILE 指定路径，可选）
       └─ 环境变量（GSLEEK_ 前缀）
```

- **Defaults**: provided by `#[serde(default)]` + `impl Default for Settings`; any field missing from a source falls back to its default.
- **TOML file**: optional. The path (without extension) comes from the `GSLEEK_CONFIG_FILE` environment variable; config-rs picks up `.toml` automatically. Unset means no file is loaded.
- **Environment variables**: always in effect. Uniform `GSLEEK_` prefix with a single `_` between prefix and key (config-rs default behavior). `try_parsing(true)` parses numbers/booleans correctly; `ignore_empty(true)` treats empty-string values as unset.

> config-rs `with_prefix("GSLEEK")` defaults to a single `_` as the prefix separator (source: `config-rs/src/env.rs:245-249`), so `GSLEEK_BASE_URL` → key `base_url`.

## Load timing

`main()` loads once at startup and installs a process-wide singleton (`OnceLock<Settings>`):

```rust
let settings = config::Settings::load()?;
config::init(settings);
// 后续任意位置：config::settings().base_url
```

## Configurable fields

| Field                    | Environment variable            | Type   | Default                              | Notes                                                                                                                                                                                 |
| ------------------------ | ------------------------------- | ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base_url`               | `GSLEEK_BASE_URL`               | string | `https://grilling-sleek.example.com` | Base for session links (`{base_url}/#{session_id}`)                                                                                                                                   |
| `db_path`                | `GSLEEK_DB_PATH`                | string | `./data/grilling-sleek.db`           | SQLite database file path                                                                                                                                                             |
| `log_dir`                | `GSLEEK_LOG_DIR`                | string | `./log/grilling-sleek`               | Log directory (tracing-appender rolling files)                                                                                                                                        |
| `archive_retention_days` | `GSLEEK_ARCHIVE_RETENTION_DAYS` | int    | `7`                                  | Days to keep `session_archive` rows; a background task deletes expired rows in batches (steady-state disk ceiling ≈ worst-case abusive write rate × this value); `0` disables cleanup |

## Helper environment variables

| Variable                      | Purpose                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| `GSLEEK_CONFIG_FILE`          | TOML config file path (without extension). When set, config-rs loads from it and errors if missing. |
| `RUST_LOG`                    | tracing log level (e.g. `info`).                                                                    |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP export endpoint. Set enables remote OTel export; unset writes local files.                     |

## Environment variable naming rules

- Uniform `GSLEEK_` prefix.
- Flat keys (every field is a top-level key; no nesting).
- A single `_` separates prefix from key.
- Introducing nested structures later (e.g. `[server] host`) requires `.separator("__")` so `GSLEEK_SERVER__HOST` → `server.host`.

## Constants not yet in Settings

These parameters are `pub const` today (see `server/src/config.rs`) and are not part of `Settings` yet; they migrate over time:

| Constant                     | Value            | Purpose                                                                 |
| ---------------------------- | ---------------- | ----------------------------------------------------------------------- |
| `LISTEN_ADDR`                | `127.0.0.1:8000` | Listen address                                                          |
| `SESSION_TTL`                | `3600` (s)       | Fixed session TTL                                                       |
| `MAX_SESSIONS`               | `15_000`         | DashMap soft capacity                                                   |
| `MAX_SSE_CONNECTIONS`        | `50_000`         | Global SSE connection soft cap                                          |
| `LONGPOLL_WAIT`              | `55` (s)         | Per-long-poll blocking cap                                              |
| `KEEPALIVE_INTERVAL`         | `85s`            | SSE keepalive interval                                                  |
| `SHUTDOWN_TIMEOUT`           | `30s`            | Graceful shutdown cap                                                   |
| `SWEEP_INTERVAL`             | `30s`            | TTL sweep period                                                        |
| `BUSY_TIMEOUT`               | `5s`             | SQLite busy_timeout                                                     |
| `ACQUIRE_TIMEOUT`            | `5s`             | sqlx connection-acquire timeout                                         |
| `RATE_LIMIT_PER_MIN`         | `20`             | Per-IP session-creation limit (strict inner limit on POST /v1/sessions) |
| `RATE_LIMIT_GENERAL_PER_MIN` | `120`            | Per-IP general limit (all business routes; health probes exempt)        |
| `IDEMPOTENCY_TTL`            | `300s`           | Idempotency cache entry TTL                                             |
| `IDEMPOTENCY_CAPACITY`       | `10_000`         | Idempotency cache capacity                                              |
| `RETENTION_INTERVAL`         | `3600s`          | Archive-retention cleanup period                                        |
| `RETENTION_BATCH`            | `500`            | Rows deleted per archive-retention batch (bounds WAL peaks)             |

## The Duration plan

The seven `Duration`-typed constants (`KEEPALIVE_INTERVAL`, `RETENTION_INTERVAL`, …) are outside configuration because config-rs internal values (`ValueKind`) cover only scalars/tables/arrays and do not natively support `std::time::Duration` (serde expects a `{secs, nanos}` struct).

The planned extraction uses **humantime** (2.4.0) to parse human-readable strings (e.g. `"85s"`, `"5m"`) for the best readability. The crate was vetted: actively maintained, latest commit 2026-07-13, with 2.4.0 released days earlier.

## Implementation references

- Crate: `config` (config-rs) 0.15, `default-features = false, features = ["toml"]`
- Source: `server/src/config.rs`
- Context repo (cloned at `.local/contexts/config-rs`, tag `v0.15.25`)
