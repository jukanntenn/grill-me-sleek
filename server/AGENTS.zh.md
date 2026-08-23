# AGENTS.md — server/

[English](AGENTS.md) | 中文

仅对 Rust 树生效的命令；仓库级规则在根 [`AGENTS.md`](../AGENTS.zh.md)，此处绝不重复。

## Commands

```
cargo test          # unit + integration tests
cargo run           # dev server on 127.0.0.1:8000
```

## Style

`cargo fmt` 与 `cargo clippy --all-targets --locked -- -D warnings`（警告即错误；`--locked` 同时门控 `Cargo.lock` 新鲜度）——都由 `server/prek.toml` 拥有。配置：`server/rustfmt.toml`、`server/clippy.toml`（msrv 1.85）。SQL 一律走 sqlx 编译期宏（`query!` / `query_as!`）；绝不用裸字符串。

## Database workflow

sqlx 在编译期依据检入的离线缓存校验 SQL——构建绝不连接数据库（`SQLX_OFFLINE=true` 为默认；见 `.env.example`）。

- `server/.sqlx/` 是生成物。绝不手改；缓存过期时 `server:sqlx-check` 令提交失败。
- 触碰 `migrations/`、`query!` 宏、`server/src/db/` 或 `Cargo.toml` 中的 sqlx 版本后，在仓库根运行：

```
python3 scripts/migrate.py prepare   # rebuild throwaway SQLite -> regenerate .sqlx/
python3 scripts/migrate.py check     # what prek/CI run
python3 scripts/migrate.py add NAME  # create a new migration file
```

其 why（离线确定性构建）记录在 [sqlx-offline GS-RFC](../.agents/gs-rfcs/implemented/2026-07-17-sqlx-offline-deterministic-builds.zh.md)。
