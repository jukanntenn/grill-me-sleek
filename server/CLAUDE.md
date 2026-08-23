# AGENTS.md — server/

English | [中文](AGENTS.zh.md)

Orders for the Rust tree only; the root [`AGENTS.md`](../AGENTS.md) carries the repo-wide rules and is never repeated here.

## Commands

```
cargo test          # unit + integration tests
cargo run           # dev server on 127.0.0.1:8000
```

## Style

`cargo fmt` and `cargo clippy --all-targets --locked -- -D warnings` (warnings are errors; `--locked` also gates `Cargo.lock` freshness) — both owned by `server/prek.toml`. Config: `server/rustfmt.toml`, `server/clippy.toml` (msrv 1.85). SQL goes through sqlx compile-time macros (`query!` / `query_as!`); never raw strings.

## Database workflow

sqlx validates SQL at compile time against a checked-in offline cache — builds never connect to a database (`SQLX_OFFLINE=true` is the default; see `.env.example`).

- `server/.sqlx/` is GENERATED. Never hand-edit; `server:sqlx-check` fails the commit when stale.
- After touching `migrations/`, a `query!` macro, `server/src/db/`, or the sqlx version in `Cargo.toml`, run from the repo root:

```
python3 scripts/migrate.py prepare   # rebuild throwaway SQLite -> regenerate .sqlx/
python3 scripts/migrate.py check     # what prek/CI run
python3 scripts/migrate.py add NAME  # create a new migration file
```

The why (offline deterministic builds) is recorded in [the sqlx-offline GS-RFC](../.agents/gs-rfcs/implemented/2026-07-17-sqlx-offline-deterministic-builds.md).
