# GS-RFC: sqlx 离线确定性构建

Status: implemented

[English](2026-07-17-sqlx-offline-deterministic-builds.md) | 中文

## Problem

sqlx 的 `query!`/`query_as!` 宏在编译期校验 SQL，默认意味着 `cargo build` 期间要有活的数据库连接。Docker 构建与 CI 没有数据库，而一个"编译时连到什么数据库就校验什么"的构建不可复现——同一个 commit 在一台机器上通过、在另一台上失败（离线缓存随 `75f5908` 于 2026-07-17 引入）。

## Decision

检入仓库的 `server/.sqlx/` 离线缓存是 SQL 的编译期唯一事实来源。`SQLX_OFFLINE=true` 为默认值（见 `server/.env.example`），`cargo build` 使用缓存、绝不连接数据库。缓存是生成物、绝不手改：`python3 scripts/migrate.py prepare`（在仓库根运行）从 `migrations/` 构建一次性 SQLite 数据库、重新生成 `.sqlx/` 并清理现场。新鲜度被双重门控——prek 的 `server:sqlx-check` 钩子在缓存过期时令提交失败，`cargo clippy --locked` 在 `Cargo.lock` 漂移时失败。任何触及 `server/migrations/`、`server/src/db/` 或 `server/Cargo.toml` 的人都在同一批变更里运行 `prepare`。

## Alternatives considered

**构建时使用活的 `DATABASE_URL`。** 落败：Docker 与 CI 构建没有数据库，且依赖"恰好连得上的 schema"的构建不确定性——正是这个决策要关掉的失败模式。

**用运行时查询替代宏。** 落败：裸字符串放弃了针对锁定 sqlx 版本的编译期 SQL 校验，把一类构建期即可捕获的错误换成生产期才发现的错误——违背 ground-everything-in-fact 原则。

**离线模式作为可选项。** 落败：确定性路径必须是默认值；可选开关意味着新机器上的第一次构建静默走上不确定的那条路。

## Consequences

构建是封闭的：同一个 commit 在笔记本、Docker 与 CI 中以相同方式编译，SQL 在编译期被校验。代价：每次迁移或 `query!` 变更都在同一批变更里携带一次 `migrate.py prepare` 再生成（`sqlx-check` 门控强制），缓存给树增加了"经过评审但属于生成物"的 JSON（豁免格式化工具、按新鲜度校验），且 `prepare` 需要可用的 Rust 工具链。
