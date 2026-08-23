#!/usr/bin/env python3
# Current-state prose: README, package readmes, design references, and
# the manual describe what IS, never what changed. History narration
# ("previously", "no longer", 此前/不再/已移除...) belongs in GS-RFCs and
# CHANGELOG. Agent instructions and GS-RFCs legitimately cite history
# and are out of scope. Part of doc_sync.py.
from __future__ import annotations

import re
import sys
from pathlib import Path

from doclib import ROOT, corpus, mask_source, restrict

BANNED = [
    (re.compile(r"\bpreviously\b", re.IGNORECASE), "previously"),
    (re.compile(r"\bno longer\b", re.IGNORECASE), "no longer"),
    (re.compile(r"\bformerly\b", re.IGNORECASE), "formerly"),
    (re.compile(r"此前|不再|已移除|已废弃|原来是|现在改为|旧版"), "change narration"),
]

_IN_SCOPE = (
    "README.md",
    "README.zh.md",
    "cli/README.md",
    "cli/README.zh.md",
    "web/DESIGN.md",
    "web/DESIGN.zh.md",
    "e2e/MANUAL.md",
    "e2e/MANUAL.zh.md",
)


def in_scope(rel: str) -> bool:
    if rel in _IN_SCOPE:
        return True
    return rel.startswith("specs/") and not rel.startswith("specs/AGENTS")


def check(path: Path) -> list[str]:
    rel = path.relative_to(ROOT).as_posix()
    problems: list[str] = []
    for lineno, line in enumerate(
        mask_source(path.read_text(encoding="utf-8")).split("\n"), start=1
    ):
        for pattern, label in BANNED:
            if pattern.search(line):
                problems.append(f"{rel}:{lineno}: {label}: {line.strip()[:90]}")
                break
    return problems


def main(argv: list[str]) -> int:
    files = [p for p in corpus() if in_scope(p.relative_to(ROOT).as_posix())]
    if argv[1:]:
        files = restrict(files, argv[1:])
    problems: list[str] = []
    for path in files:
        problems.extend(check(path))
    if problems:
        print(
            "verify_doc_current: history narration in current-state docs",
            "(move the story to a GS-RFC, keep the fact):",
            file=sys.stderr,
        )
        print("\n".join(f"  {p}" for p in problems), file=sys.stderr)
        return 1
    print(f"verify_doc_current: {len(files)} current-state file(s) clean")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
