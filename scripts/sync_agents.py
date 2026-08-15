#!/usr/bin/env python3
# Sync AI tool configs from their source of truth:
#   - AGENTS.md → CLAUDE.md (Claude Code reads CLAUDE.md)
#   - .claude/skills/<skill> → .agents/skills/ and .zcode/skills/ (the
#     non-packaged skills that are mirrored across tools)
# The packaged grilling-sleek skill is never touched (AGENTS.md §8).
# Run this whenever AGENTS.md or .claude/skills/ changes.
# Checked by the prek agents-sync hook.
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

MIRRORED_SKILLS = ("commit", "shipping", "playwright-cli", "release")
MIRROR_DIRS = (ROOT / ".agents" / "skills", ROOT / ".zcode" / "skills")

shutil.copy2(ROOT / "AGENTS.md", ROOT / "CLAUDE.md")
print("Synced CLAUDE.md <- AGENTS.md")

canonical = ROOT / ".claude" / "skills"
for skill in MIRRORED_SKILLS:
    src = canonical / skill
    if not src.is_dir():
        print(f"WARNING: {src} does not exist, skipping")
        continue
    for mirror in MIRROR_DIRS:
        dst = mirror / skill
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
        print(f"Synced {dst} <- {src}")
