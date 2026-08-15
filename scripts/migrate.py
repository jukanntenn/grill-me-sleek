#!/usr/bin/env python3
"""SQLx migration & offline-cache workflow for the grilling-sleek server.

This is the single entry point for everything related to the database schema
and the `.sqlx/` compile-time query cache. It replaces ad-hoc shell incantations
and keeps the workflow identical for humans, CI, and the pre-commit hook.

Subcommands
-----------
- `prepare` : Build a throwaway SQLite DB from `migrations/`, regenerate the
              `.sqlx/` offline cache, then discard the DB. Run this whenever a
              migration or a `query!` macro changes.
- `add NAME`: Create a new timestamped migration file under `migrations/`.
- `check`   : CI-equivalent verification: build a throwaway DB and assert the
              `.sqlx/` cache is up to date. Exits non-zero if stale.

Environment
-----------
- `SQLX_OFFLINE` is forced to `false` for `prepare`/`check` so sqlx actually
  connects to the throwaway DB (the project default in `server/.env` is `true`).
- `DATABASE_URL` is set to a temp file and points at `server/`, so the
  `migrations/` directory is found without `--source`.

Exit codes
----------
0 on success, 1 on any failure (with a diagnostic on stderr).
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# Project layout: scripts/migrate.py -> project root is parents[1].
PROJECT_ROOT = Path(__file__).resolve().parents[1]
SERVER_DIR = PROJECT_ROOT / "server"
MIGRATIONS_DIR = SERVER_DIR / "migrations"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def die(msg: str) -> "None":
    """Print an error to stderr and exit 1."""
    print(f"migrate: error: {msg}", file=sys.stderr)
    sys.exit(1)


def run(
    cmd: list[str],
    *,
    cwd: Path,
    env: dict[str, str],
    timeout: int = 300,
) -> subprocess.CompletedProcess[str]:
    """Run a command, streaming output to the inherited stdio.

    Raises SystemExit(1) with context on non-zero exit, timeout, or missing
    binary.
    """
    print(f"$ {' '.join(cmd)}", file=sys.stderr, flush=True)
    try:
        result = subprocess.run(cmd, cwd=str(cwd), env=env, timeout=timeout, check=False)
    except FileNotFoundError as exc:
        die(f"required tool not found: {exc.filename} (is sqlx-cli / cargo installed?)")
    except subprocess.TimeoutExpired:
        die(f"command timed out after {timeout}s: {' '.join(cmd)}")
    if result.returncode != 0:
        die(f"command failed (exit {result.returncode}): {' '.join(cmd)}")
    return result


def env_for_db(db_url: str) -> dict[str, str]:
    """Build the environment for sqlx commands that must hit a real DB.

    Unsets `SQLX_OFFLINE` so sqlx does not ignore the live connection.
    """
    env = os.environ.copy()
    env["DATABASE_URL"] = db_url
    env["SQLX_OFFLINE"] = "false"
    return env


def sqlx_setup(db_url: str) -> None:
    """Create the DB and run all pending migrations in one step.

    `sqlx database setup` = create + migrate run; it is idempotent.
    """
    run(
        ["sqlx", "database", "setup"],
        cwd=SERVER_DIR,
        env=env_for_db(db_url),
    )


def cargo_sqlx_prepare(db_url: str, *, check: bool) -> None:
    """Regenerate (or verify) the `.sqlx/` offline cache.

    The cache lives at `server/.sqlx/` and is checked into git so Docker and CI
    builds never need a live DB. `--check` makes this a verification that exits
    non-zero when the cache is stale.
    """
    cmd = ["cargo", "sqlx", "prepare"]
    if check:
        cmd.append("--check")
    run(cmd, cwd=SERVER_DIR, env=env_for_db(db_url))


# ---------------------------------------------------------------------------
# Subcommands
# ---------------------------------------------------------------------------


def cmd_prepare(_args: argparse.Namespace) -> None:
    """Regenerate the `.sqlx/` offline cache against a throwaway DB."""
    if not MIGRATIONS_DIR.is_dir():
        die(f"migrations directory not found: {MIGRATIONS_DIR}")

    with tempfile.TemporaryDirectory(prefix="gs-sqlx-") as tmp:
        db_path = Path(tmp) / "prepare.db"
        db_url = f"sqlite://{db_path}"
        print(f"[prepare] throwaway DB: {db_url}", file=sys.stderr)
        sqlx_setup(db_url)
        cargo_sqlx_prepare(db_url, check=False)
    print("[prepare] `.sqlx/` cache refreshed. Commit the updated files.", file=sys.stderr)


def cmd_add(args: argparse.Namespace) -> None:
    """Create a new timestamped migration file."""
    name = args.name
    if not name:
        die("migration name is required, e.g. `migrate add add_user_index`")
    # `sqlx migrate add` resolves `migrations/` relative to the working dir.
    run(["sqlx", "migrate", "add", name], cwd=SERVER_DIR, env=env_for_db("sqlite:unused"))
    print(f"[add] created migration for '{name}'.", file=sys.stderr)


def cmd_check(_args: argparse.Namespace) -> None:
    """CI-style verification that the `.sqlx/` cache is up to date."""
    if not MIGRATIONS_DIR.is_dir():
        die(f"migrations directory not found: {MIGRATIONS_DIR}")

    with tempfile.TemporaryDirectory(prefix="gs-sqlx-check-") as tmp:
        db_path = Path(tmp) / "check.db"
        db_url = f"sqlite://{db_path}"
        print(f"[check] throwaway DB: {db_url}", file=sys.stderr)
        sqlx_setup(db_url)
        cargo_sqlx_prepare(db_url, check=True)
    print("[check] `.sqlx/` cache is up to date.", file=sys.stderr)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    # Guard against running from the wrong place.
    if not SERVER_DIR.is_dir():
        die(f"server directory not found at {SERVER_DIR}")

    # `sqlx` must be on PATH.
    if shutil.which("sqlx") is None:
        die(
            "sqlx-cli is not installed. Run: "
            "`cargo install sqlx-cli --no-default-features --features sqlite`"
        )

    parser = argparse.ArgumentParser(
        prog="migrate.py",
        description="grilling-sleek SQLx migration & `.sqlx` cache workflow.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_prepare = sub.add_parser(
        "prepare",
        help="Regenerate the `.sqlx/` offline cache against a throwaway DB.",
    )
    p_prepare.set_defaults(func=cmd_prepare)

    p_add = sub.add_parser("add", help="Create a new migration file.")
    p_add.add_argument("name", help="Short snake_case description, e.g. add_user_index")
    p_add.set_defaults(func=cmd_add)

    p_check = sub.add_parser(
        "check",
        help="Verify the `.sqlx/` cache is up to date (CI mode).",
    )
    p_check.set_defaults(func=cmd_check)

    args = parser.parse_args(argv)
    args.func(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
