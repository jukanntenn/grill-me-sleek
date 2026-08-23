#!/usr/bin/env python3
# Verify AI tool configs are in sync, fail if not.
# Companion to scripts/sync_agents.py which performs the fix.
# prek pre-commit hook (agents-sync).
#
# Instruction files are direction-free mirror pairs (see agentlib.py):
# a single-sided edit self-heals via sync_agents.py; a both-sides edit
# is a conflict this check refuses to guess through. The mirrored-skill
# set is derived from .claude/skills/ (agentlib.mirrored_skills).
#
# The packaged grilling-sleek skill is deliberately NOT checked: it
# ships in different shapes per tool (AGENTS.md forbids editing it in
# place).
from __future__ import annotations

import sys

from agentlib import CONFLICT, DELETED, MIRROR_PAIRS, pair_status, skills_in_sync


def main() -> int:
    failed = False

    for agents, claude in MIRROR_PAIRS:
        status = pair_status(agents, claude)
        if status.status == CONFLICT:
            print(f"ERROR: {status.detail}")
            print(
                "  Both sides changed since HEAD. Reconcile manually: "
                "diff the two files, decide the surviving content, write it "
                "into BOTH files byte-identical, then re-run this check. "
                "The tooling refuses to pick a winner."
            )
            failed = True
        elif status.status == DELETED:
            print(f"ERROR: {status.detail} — restore the pair or remove both sides deliberately")
            failed = True
        elif status.status != "in-sync":
            print(f"ERROR: {status.detail} — run python3 scripts/sync_agents.py")
            failed = True

    ok, problems = skills_in_sync()
    if not ok:
        for problem in problems:
            print(f"ERROR: {problem} — run python3 scripts/sync_agents.py")
        failed = True

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
