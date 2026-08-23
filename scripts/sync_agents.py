#!/usr/bin/env python3
# Sync AI tool configs from their source of truth:
#   - AGENTS.md <-> CLAUDE.md mirror pairs (direction-free: the side
#     changed against HEAD wins; see agentlib.py)
#   - .claude/skills/<skill> -> .agents/skills/ and .zcode/skills/
#     (the non-packaged skills mirrored across tools; the set is
#     derived from the directory, never hardcoded)
# The packaged grilling-sleek skill is never touched.
# Run this whenever an AGENTS.md/CLAUDE.md pair or .claude/skills/
# changes. Checked by the prek agents-sync hook.
from __future__ import annotations

import sys

from agentlib import CONFLICT, DELETED, MIRROR_PAIRS, apply_fix, pair_status, stage, sync_skills


def main() -> int:
    failed = False

    for agents, claude in MIRROR_PAIRS:
        status = pair_status(agents, claude)
        if status.status == CONFLICT:
            print(f"ERROR: {status.detail}")
            print(
                "  Both sides changed since HEAD; refusing to pick a winner. "
                "Reconcile manually, write the surviving content into BOTH "
                "files byte-identical, then re-run."
            )
            failed = True
        elif status.status == DELETED:
            print(f"ERROR: {status.detail} — restore the pair or remove both sides deliberately")
            failed = True
        elif status.status == "fixed":
            apply_fix(status)
            stage(agents)
            stage(claude)
            print(f"Synced {status.older} <- {status.newer} ({status.detail})")

    if not failed:
        sync_skills()

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
