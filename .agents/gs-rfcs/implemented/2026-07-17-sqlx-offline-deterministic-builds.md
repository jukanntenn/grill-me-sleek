# GS-RFC: sqlx offline deterministic builds

Status: implemented

English | [中文](2026-07-17-sqlx-offline-deterministic-builds.zh.md)

## Problem

sqlx `query!`/`query_as!` macros validate SQL at compile time, which by default means a live database connection during `cargo build`. Docker builds and CI have no database, and a build that compiles against whatever database happens to be reachable is not reproducible — the same commit can pass on one machine and fail on another (introduced with the offline cache in `75f5908`, 2026-07-17).

## Decision

The checked-in `server/.sqlx/` offline cache is the compile-time source of truth for SQL. `SQLX_OFFLINE=true` is the default (see `server/.env.example`), so `cargo build` uses the cache and never connects to a database. The cache is generated, never hand-edited: `python3 scripts/migrate.py prepare` (run from the repo root) builds a throwaway SQLite database from `migrations/`, regenerates `.sqlx/`, and cleans up. Freshness is gated twice — the prek `server:sqlx-check` hook fails the commit when the cache is stale, and `cargo clippy --locked` fails when `Cargo.lock` drifted. Anyone touching `server/migrations/`, `server/src/db/`, or `server/Cargo.toml` runs `prepare` in the same change.

## Alternatives considered

**A live `DATABASE_URL` at build time.** It lost: Docker and CI builds have no database, and a build that depends on whatever schema happens to be reachable is nondeterministic — the exact failure mode this decision exists to close.

**Runtime queries instead of macros.** It lost: raw strings give up compile-time SQL validation against the pinned sqlx version, trading a class of errors caught at build for ones discovered in production — against the ground-everything-in-fact principle.

**Offline mode as an opt-in.** It lost: the deterministic path must be the default; an opt-in flag means the first build on a fresh machine silently takes the nondeterministic one.

## Consequences

Builds are hermetic: the same commit compiles identically on a laptop, in Docker, and in CI, with SQL checked at compile time. The costs: every migration or `query!` change carries a `migrate.py prepare` regeneration in the same change (the `sqlx-check` gate enforces it), the cache adds reviewed-but-generated JSON to the tree (exempt from formatters, validated for freshness), and `prepare` needs a working Rust toolchain to run.
