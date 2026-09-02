#!/usr/bin/env python3
"""Propagate the version from the anchor (root package.json) to the rest
of the unified version train. The member set is shared with the read-only
gate (scripts/verify_versions.py) via versionlib, so the mutating tool
and the gate cannot drift apart. Used by the release skill's bump step;
--dry-run previews. server/Cargo.lock is refreshed by cargo itself on the
next cargo invocation (clippy --locked gates its freshness); after any
real run the train is re-read and must be consistent."""
from __future__ import annotations

import sys
from typing import Sequence

from versionlib import ANCHOR, ROOT, TRAIN, read_train


def main(argv: Sequence[str]) -> int:
    dry_run = "--dry-run" in argv

    anchor_member = next(m for m in TRAIN if m[0] == ANCHOR)
    anchor = anchor_member[1](ROOT / ANCHOR)
    if anchor is None:
        print(f"Error: no version in {ANCHOR}", file=sys.stderr)
        return 1

    print(f"📦 Propagating version: {anchor}")
    if dry_run:
        print("(dry run mode)")
    print()

    ok = True
    for rel, reader, setter in TRAIN:
        if rel == ANCHOR:
            continue
        path = ROOT / rel
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            print(f"✗ {rel}: unreadable", file=sys.stderr)
            ok = False
            continue
        old = reader(path)
        if old == anchor:
            print(f"✓ {rel} already at version {anchor}")
            continue
        new_text, changed = setter(text, anchor)
        if not changed:
            print(f"✗ {rel}: no version to replace", file=sys.stderr)
            ok = False
            continue
        if dry_run:
            print(f"✓ {rel}: {old} → {anchor} (dry run)")
            continue
        path.write_text(new_text, encoding="utf-8")
        print(f"✓ {rel}: {old} → {anchor}")

    print()
    if not ok:
        print("⚠️  Some members failed to update", file=sys.stderr)
        return 1
    if dry_run:
        print(f"✅ Version {anchor} would be propagated to the whole train")
        return 0

    versions = {version for _, version in read_train() if version is not None}
    if versions != {anchor}:
        print(f"⚠️  Post-write check failed — train carries {sorted(versions)}", file=sys.stderr)
        return 1
    print(f"✅ Version {anchor} synced across the train")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
