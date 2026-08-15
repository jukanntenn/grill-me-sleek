#!/usr/bin/env python3
# Verify AI tool configs are in sync, fail if not.
# Companion to scripts/sync_agents.py which performs the fix.
# prek pre-commit hook (agents-sync).
#
# The packaged grilling-sleek skill is deliberately NOT checked: it ships in
# different shapes per tool (AGENTS.md §8 forbids editing it in place).
from __future__ import annotations

import filecmp
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

MIRRORED_SKILLS = ("commit", "shipping", "playwright-cli", "release")
SKILL_DIRS = (ROOT / ".claude" / "skills", ROOT / ".agents" / "skills", ROOT / ".zcode" / "skills")


def _collect(root: Path) -> dict[Path, Path]:
    return {p.relative_to(root): p for p in root.rglob("*") if p.is_file()}


def _skill_equal(canonical: Path, mirror: Path) -> bool:
    if not canonical.is_dir() or not mirror.is_dir():
        return False
    fa, fb = _collect(canonical), _collect(mirror)
    if set(fa) != set(fb):
        return False
    return all(filecmp.cmp(fa[k], fb[k], shallow=False) for k in fa)


def main() -> int:
    failed = False

    agents, claude = ROOT / "AGENTS.md", ROOT / "CLAUDE.md"
    if not agents.is_file() or not filecmp.cmp(agents, claude, shallow=False):
        print("ERROR: AGENTS.md != CLAUDE.md — run scripts/sync_agents.py")
        failed = True

    canonical_dir = SKILL_DIRS[0]
    for skill in MIRRORED_SKILLS:
        canonical = canonical_dir / skill
        for mirror_dir in SKILL_DIRS[1:]:
            mirror = mirror_dir / skill
            if not _skill_equal(canonical, mirror):
                print(
                    f"ERROR: {canonical} != {mirror} — run scripts/sync_agents.py"
                )
                failed = True

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
