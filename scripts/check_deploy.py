#!/usr/bin/env python3
"""Post-deploy verification for grilling-sleek (run on the controller by deploy.yml).

Three phases:
  1. Poll GET {base}/v1/healthz until it answers {"status": "ok"}
     (interval/timeout configurable). Container-level healthchecks only prove
     the process is up; this exercises the published port through Caddy — and
     for production, through the Cloudflare edge the real visitors use.
  2. Poll GET {base}/v1/readyz until 200 — proves the SQLite connection pool
     actually works, not just that the process answers.
  3. When --version is given, compare the `version` field reported by
     /v1/healthz against the expected version. This is the actual deploy
     verification: a container can be healthy while still running the previous
     image. Leading "v" is normalized on both sides (git tags are v-prefixed,
     the server reports the bare Cargo.toml version).

Expected version comes from the playbook: server/Cargo.toml of the deploying
checkout for `main`-tag (staging) deploys, or the pinned Docker tag for
production releases.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request


def fetch_json(url: str, timeout: float) -> dict | None:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            if resp.status != 200:
                return None
            return json.loads(resp.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None


def wait_healthz(base_url: str, interval: float, timeout: float) -> bool:
    url = f"{base_url}/v1/healthz"
    deadline = time.monotonic() + timeout
    attempt = 0
    while time.monotonic() < deadline:
        attempt += 1
        body = fetch_json(url, timeout=interval)
        if body and body.get("status") == "ok":
            print(f"healthz: ok ({url}, {attempt} attempt(s))")
            return True
        print(f"healthz: not ready yet ({url}, attempt {attempt})", flush=True)
        time.sleep(interval)
    return False


def wait_readyz(base_url: str, interval: float, timeout: float) -> bool:
    """readyz returns 503 until the SQLite pool answers; None means non-200."""
    url = f"{base_url}/v1/readyz"
    deadline = time.monotonic() + timeout
    attempt = 0
    while time.monotonic() < deadline:
        attempt += 1
        body = fetch_json(url, timeout=interval)
        if body and body.get("status") == "ok":
            print(f"readyz: ok ({url}, {attempt} attempt(s))")
            return True
        print(f"readyz: DB not ready yet ({url}, attempt {attempt})", flush=True)
        time.sleep(interval)
    return False


def normalize(version: str) -> str:
    return version.lstrip("v")


def check_version(base_url: str, expected: str, timeout: float) -> bool:
    url = f"{base_url}/v1/healthz"
    body = fetch_json(url, timeout=timeout)
    if body is None:
        print(f"version: endpoint unreachable ({url})")
        return False
    actual = str(body.get("version", ""))
    if normalize(actual) != normalize(expected):
        print(f"version: MISMATCH — expected {expected!r}, running {actual!r}")
        print("hint: the container is serving an old image; check the pulled tag")
        return False
    print(f"version: {actual} (matches expected {expected})")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify a grilling-sleek deployment")
    parser.add_argument(
        "--base-url",
        required=True,
        help="Public base URL, e.g. https://grillingsleek.online or http://192.168.5.200:8090",
    )
    parser.add_argument(
        "--version",
        default=None,
        help="Expected server version (healthz `version` field); omit to skip the version check",
    )
    parser.add_argument(
        "--interval", type=float, default=5.0, help="Seconds between polls (default: 5)"
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=120.0,
        help="Seconds to wait per phase before failing (default: 120)",
    )
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    if not wait_healthz(base, args.interval, args.timeout):
        print(f"FAILED: {base}/v1/healthz not ready within {args.timeout:.0f}s")
        return 1
    if not wait_readyz(base, args.interval, args.timeout):
        print(f"FAILED: {base}/v1/readyz not ready within {args.timeout:.0f}s")
        return 1

    if args.version is None:
        return 0
    if not check_version(base, args.version, timeout=args.interval):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
