#!/usr/bin/env python3
# specs/index.md is the authoritative index of spec documents: every
# spec file has a row, every row points at an existing file, in both
# directions. AGENTS.md and index.md itself are tree files, not spec
# documents; rust-guidelines.md is vendored and still indexed. The zh
# twin of the index is covered by the pairs gate. Part of doc_sync.py.
from __future__ import annotations

import re
import sys
from pathlib import Path

from doclib import ROOT

SPECS = ROOT / "specs"
INDEX = SPECS / "index.md"
TREE_FILES = {"index.md", "AGENTS.md", "CLAUDE.md"}


def main(argv: list[str]) -> int:
    if not INDEX.is_file():
        print(
            "verify_specs_index: specs/index.md is missing — create it with one row per spec document",
            file=sys.stderr,
        )
        return 1

    linked: set[str] = set()
    for line in INDEX.read_text(encoding="utf-8").splitlines():
        if not line.lstrip().startswith("|"):
            continue
        for m in re.finditer(r"\]\(([^)#\s]+\.md)\)", line):
            name = Path(m.group(1)).name
            if not name.endswith(".zh.md"):
                linked.add(name)

    actual = {
        p.name
        for p in SPECS.glob("*.md")
        if p.name not in TREE_FILES and not p.name.endswith(".zh.md")
    }

    problems: list[str] = []
    for name in sorted(actual - linked):
        problems.append(f"specs/{name}: spec document without a row in specs/index.md")
    for name in sorted(linked - actual):
        problems.append(f"specs/index.md: row links to nonexistent specs/{name}")

    if problems:
        print("verify_specs_index: index and tree disagree:", file=sys.stderr)
        print("\n".join(f"  {p}" for p in problems), file=sys.stderr)
        return 1
    print(f"verify_specs_index: {len(actual)} spec document(s) indexed, both directions")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
