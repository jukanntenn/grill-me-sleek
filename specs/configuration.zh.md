# 配置规范（Configuration）

[English](configuration.md) | 中文

服务端的运行时配置体系。采用 **config-rs**（0.15）实现分层配置，取代手写的 `std::env::var` 逻辑。

## Layered model

配置按优先级从低到高合并，后者覆盖前者：

```
默认值（Settings::default）
  └─ TOML 文件（GSLEEK_CONFIG_FILE 指定路径，可选）
       └─ 环境变量（GSLEEK_ 前缀）
```

- **默认值**：由 `#[serde(default)]` + `impl Default for Settings` 提供，任何来源缺失的字段回退到默认。
- **TOML 文件**：可选。由 `GSLEEK_CONFIG_FILE` 环境变量指定文件路径（不含扩展名，config-rs 自动识别 `.toml`）。未设置则不加载文件。
- **环境变量**：始终生效。统一 `GSLEEK_` 前缀，前缀与键之间用单 `_` 分隔（config-rs 默认行为）。`try_parsing(true)` 使数字/布尔值被正确解析；`ignore_empty(true)` 使空字符串值视为未设置。

> config-rs `with_prefix("GSLEEK")` 默认前缀分隔符为单 `_`（源码 `config-rs/src/env.rs:245-249`），故 `GSLEEK_BASE_URL` → 键 `base_url`。

## Load timing

`main()` 启动时一次性加载并装入进程级单例（`OnceLock<Settings>`）：

```rust
let settings = config::Settings::load()?;
config::init(settings);
// 后续任意位置：config::settings().base_url
```

## Configurable fields

| 字段                     | 环境变量                        | 类型   | 默认值                               | 说明                                                                                                         |
| ------------------------ | ------------------------------- | ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `base_url`               | `GSLEEK_BASE_URL`               | string | `https://grilling-sleek.example.com` | 会话链接基址（`{base_url}/#{session_id}`）                                                                   |
| `db_path`                | `GSLEEK_DB_PATH`                | string | `./data/grilling-sleek.db`           | SQLite 数据库文件路径                                                                                        |
| `log_dir`                | `GSLEEK_LOG_DIR`                | string | `./log/grilling-sleek`               | 日志目录（tracing-appender 滚动文件）                                                                        |
| `archive_retention_days` | `GSLEEK_ARCHIVE_RETENTION_DAYS` | int    | `7`                                  | `session_archive` 保留天数；超期行由后台任务分批清理（磁盘稳态上限 ≈ 滥用最坏写入速率 × 该值）；`0` 禁用清理 |

## Helper environment variables

| 变量                          | 说明                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `GSLEEK_CONFIG_FILE`          | TOML 配置文件路径（不含扩展名）。设置后 config-rs 从该文件加载，缺失则报错。 |
| `RUST_LOG`                    | tracing 日志级别（如 `info`）。                                              |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP 导出端点。设置后启用远程 OTel 导出；未设置则写本地文件。                |

## Environment variable naming rules

- 统一 `GSLEEK_` 前缀。
- 键名扁平（当前所有配置项均为顶层字段，无嵌套）。
- 前缀与键之间用单 `_` 分隔。
- 若将来引入嵌套结构（如 `[server] host`），需用 `.separator("__")` 配置，使 `GSLEEK_SERVER__HOST` → `server.host`。

## Constants not yet in Settings

以下参数目前为 `pub const`（见 `server/src/config.rs`），尚未纳入 `Settings`。后续逐步提取：

| 常量                         | 值               | 说明                                             |
| ---------------------------- | ---------------- | ------------------------------------------------ |
| `LISTEN_ADDR`                | `127.0.0.1:8000` | 监听地址                                         |
| `SESSION_TTL`                | `3600`（秒）     | 会话固定 TTL                                     |
| `MAX_SESSIONS`               | `15_000`         | DashMap 软容量                                   |
| `MAX_SSE_CONNECTIONS`        | `50_000`         | 全局 SSE 连接软上限                              |
| `LONGPOLL_WAIT`              | `55`（秒）       | 单次长轮询阻塞上限                               |
| `KEEPALIVE_INTERVAL`         | `85s`            | SSE keepalive 间隔                               |
| `SHUTDOWN_TIMEOUT`           | `30s`            | 优雅关停上限                                     |
| `SWEEP_INTERVAL`             | `30s`            | TTL 扫描周期                                     |
| `BUSY_TIMEOUT`               | `5s`             | SQLite busy_timeout                              |
| `ACQUIRE_TIMEOUT`            | `5s`             | sqlx 连接获取超时                                |
| `RATE_LIMIT_PER_MIN`         | `20`             | 每 IP 创建会话限流（POST /v1/sessions 内层严限） |
| `RATE_LIMIT_GENERAL_PER_MIN` | `120`            | 每 IP 通用限流（全部业务路由；health 探测豁免）  |
| `IDEMPOTENCY_TTL`            | `300s`           | 幂等缓存条目 TTL                                 |
| `IDEMPOTENCY_CAPACITY`       | `10_000`         | 幂等缓存容量                                     |
| `RETENTION_INTERVAL`         | `3600s`          | 归档保留清理周期                                 |
| `RETENTION_BATCH`            | `500`            | 归档保留单批 DELETE 行数（控制 WAL 峰值）        |

## The Duration plan

当前 7 个 `Duration` 类常量（`KEEPALIVE_INTERVAL`、`RETENTION_INTERVAL` 等）未纳入配置，因 config-rs 内部值类型（`ValueKind`）只有标量/表/数组，不原生支持 `std::time::Duration`（serde 期望 `{secs, nanos}` 结构）。

后续提取时拟采用 **humantime**（2.4.0）解析人类可读字符串（如 `"85s"`、`"5m"`），可读性最佳。已调研该 crate：维护活跃，最新提交 2026-07-13，几天前刚发布 2.4.0。

## Implementation references

- crate：`config`（config-rs）0.15，`default-features = false, features = ["toml"]`
- 源码：`server/src/config.rs`
- 上下文仓库（已 clone 至 `.local/contexts/config-rs`，tag `v0.15.25`）
