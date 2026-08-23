#!/usr/bin/env python3
# Word ceilings for the agent-instruction files (scripts/
# doc_budgets.manifest.json). A budgeted file gone missing fails the
# gate so renames cannot orphan budgets. On red: relocate to the owning
# tier, then condense; raise the ceiling last, with a justified
# manifest diff in the same change. Part of doc_sync.py.
from __future__ import annotations

import json
import sys
from pathlib import Path

from doclib import ROOT

MANIFEST = ROOT / "scripts" / "doc_budgets.manifest.json"


def main(argv: list[str]) -> int:
    budgets: dict[str, int] = json.loads(MANIFEST.read_text(encoding="utf-8"))
    problems: list[str] = []
    for rel in sorted(budgets):
        ceiling = budgets[rel]
        path = ROOT / rel
        if not path.is_file():
            problems.append(
                f"{rel}: budgeted file is missing — renamed or deleted? "
                f"update {MANIFEST.relative_to(ROOT)} in the same change"
            )
            continue
        words = len(path.read_text(encoding="utf-8").split())
        if words > ceiling:
            problems.append(
                f"{rel}: {words} words exceeds the {ceiling}-word ceiling — "
                "relocate to the owning tier, then condense; raise the ceiling "
                "last with a justified manifest diff"
            )
    if problems:
        print("verify_doc_budgets: word ceilings exceeded:", file=sys.stderr)
        print("\n".join(f"  {p}" for p in problems), file=sys.stderr)
        return 1
    print(f"verify_doc_budgets: {len(budgets)} budgeted file(s) within ceilings")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
