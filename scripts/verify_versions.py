#!/usr/bin/env python3
"""Read-only gate over the unified version train: every member file must
carry the same version. With --expect, that version must additionally
equal the given one (a git tag; a leading 'v' is tolerated) — the form
release.yml and docker-publish.yml run as their first job, before any
artifact is published. The gate never fixes anything: a failure is
answered in the files (one realignment bump via scripts/sync-version.py)
or with a corrected tag. Layers that run it: the prek `version-sync` hook
at commit, `prek run --all-files` in CI, and both publish workflows."""
from __future__ import annotations

import sys
from typing import Sequence

from versionlib import normalize, read_train


def main(argv: Sequence[str]) -> int:
    args = list(argv[1:])
    expect: str | None = None
    if args and args[0] == "--expect":
        if len(args) != 2:
            print("usage: verify_versions.py [--expect VERSION_OR_TAG]", file=sys.stderr)
            return 2
        expect = args[1]
    elif args:
        print("usage: verify_versions.py [--expect VERSION_OR_TAG]", file=sys.stderr)
        return 2

    ok = True
    values: dict[str, list[str]] = {}
    for rel, version in read_train():
        if version is None:
            print(f"version: {rel} — UNREADABLE")
            print(f"FAILED: {rel}: no version found (missing file, key, or badge)")
            ok = False
            continue
        print(f"version: {rel} {version}")
        values.setdefault(normalize(version), []).append(rel)

    if len(values) > 1:
        ok = False
        detail = "; ".join(f"{v} ({', '.join(rels)})" for v, rels in sorted(values.items()))
        print(f"FAILED: version train is split — {detail}")
        print("fix: bump the train together — edit package.json, then run: python3 scripts/sync-version.py")

    if expect is not None:
        expected = normalize(expect)
        if values and expected not in values:
            ok = False
            actual = next(iter(values))
            print(f"FAILED: expected {expect!r}, train carries {actual!r}")
            print("fix: tag the version the train actually describes, or realign the train first")

    if ok:
        note = f", matches {expect}" if expect is not None else ""
        print(f"version: train consistent ({next(iter(values))}{note})")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
