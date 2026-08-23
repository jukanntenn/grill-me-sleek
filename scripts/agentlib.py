#!/usr/bin/env python3
"""Shared logic for the agent-instruction mirrors.

`AGENTS.md` and `CLAUDE.md` carry the same standing orders under the two
tool-side filenames; every pair in MIRROR_PAIRS lives in one directory.
A pair has no primary: direction is decided against git HEAD so the side
edited last wins, and both-sides-edited is a conflict the callers refuse
to guess through. mtime is the obvious alternative and is wrong — clone
and checkout reset it, leaving both sides equally "new".

The mirrored skills are derived from `.claude/skills/` minus the
packaged `grilling-sleek` skill (AGENTS.md forbids touching it), never
hardcoded — a parallel list is a drift hole waiting to open. The skill
mirror stays directional (canonical -> mirrors); `.zh.md` twins of the
instruction files are documentation pairs, not mirror pairs: tool load
paths read the English file.
"""
from __future__ import annotations

import filecmp
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

MIRROR_PAIRS: list[tuple[str, str]] = [
    ("AGENTS.md", "CLAUDE.md"),
    ("server/AGENTS.md", "server/CLAUDE.md"),
    ("web/AGENTS.md", "web/CLAUDE.md"),
    ("cli/AGENTS.md", "cli/CLAUDE.md"),
    ("e2e/AGENTS.md", "e2e/CLAUDE.md"),
    ("specs/AGENTS.md", "specs/CLAUDE.md"),
]

SKILLS_SOURCE = ROOT / ".claude" / "skills"
SKILLS_MIRRORS = [ROOT / ".agents" / "skills", ROOT / ".zcode" / "skills"]
PACKAGED_SKILLS = {"grilling-sleek"}

IN_SYNC = "in-sync"
FIXED = "fixed"
CONFLICT = "conflict"
DELETED = "deleted"


@dataclass(frozen=True)
class PairStatus:
    status: str
    newer: str | None
    older: str | None
    detail: str


def _read(path: Path) -> bytes | None:
    try:
        return path.read_bytes()
    except FileNotFoundError:
        return None


def _head(path: str) -> bytes | None:
    proc = subprocess.run(
        ["git", "-C", str(ROOT), "show", f"HEAD:{path}"],
        capture_output=True,
    )
    return proc.stdout if proc.returncode == 0 else None


def pair_status(agents: str, claude: str) -> PairStatus:
    disk = {agents: _read(ROOT / agents), claude: _read(ROOT / claude)}
    if disk[agents] is None and disk[claude] is None:
        return PairStatus(IN_SYNC, None, None, f"{agents} and {claude} both absent")

    head = {agents: _head(agents), claude: _head(claude)}
    changed = {p: disk[p] != head[p] for p in disk}

    if disk[agents] is not None and disk[claude] is not None:
        if disk[agents] == disk[claude]:
            return PairStatus(IN_SYNC, None, None, f"{agents} == {claude}")
        if changed[agents] and not changed[claude]:
            return PairStatus(FIXED, agents, claude, f"{agents} changed while {claude} stayed at HEAD")
        if changed[claude] and not changed[agents]:
            return PairStatus(FIXED, claude, agents, f"{claude} changed while {agents} stayed at HEAD")
        return PairStatus(CONFLICT, None, None, f"{agents} and {claude} each changed since HEAD and disagree")

    present, missing = (agents, claude) if disk[claude] is None else (claude, agents)
    if head[missing] is None:
        return PairStatus(FIXED, present, missing, f"{missing} is new; bootstrapped from {present}")
    if changed[present]:
        return PairStatus(CONFLICT, None, None, f"{missing} was deleted while {present} changed")
    return PairStatus(DELETED, None, None, f"{missing} was deleted while {present} stayed at HEAD")


def apply_fix(status: PairStatus) -> None:
    dst = ROOT / status.older
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / status.newer, dst)


def stage(path: str) -> bool:
    return subprocess.run(["git", "-C", str(ROOT), "add", path]).returncode == 0


def mirrored_skills() -> list[str]:
    """Skill directories to mirror: everything in the source except the
    packaged skill. Derived, never hardcoded."""
    return sorted(
        p.name
        for p in SKILLS_SOURCE.iterdir()
        if p.is_dir() and p.name not in PACKAGED_SKILLS
    )


def _collect(root: Path) -> dict[Path, Path]:
    return {p.relative_to(root): p for p in root.rglob("*") if p.is_file()}


def skills_in_sync() -> tuple[bool, list[str]]:
    """Byte-compare every mirrored skill across every mirror dir."""
    problems: list[str] = []
    if not SKILLS_SOURCE.is_dir():
        return False, [f"{SKILLS_SOURCE} does not exist"]
    canonical_files = {skill: _collect(SKILLS_SOURCE / skill) for skill in mirrored_skills()}
    for mirror in SKILLS_MIRRORS:
        if not mirror.is_dir():
            problems.append(f"{mirror} does not exist")
            continue
        for skill, files in canonical_files.items():
            mdir = mirror / skill
            if not mdir.is_dir():
                problems.append(f"{mdir} is missing (run scripts/sync_agents.py)")
                continue
            mirror_files = _collect(mdir)
            if set(files) != set(mirror_files):
                problems.append(f"{mdir} file set differs from {SKILLS_SOURCE / skill}")
            else:
                for rel in files:
                    if not filecmp.cmp(files[rel], mirror_files[rel], shallow=False):
                        problems.append(f"{mirror_files[rel]} differs from {files[rel]}")
    return not problems, problems


def sync_skills() -> None:
    """Copy every mirrored skill from the source into each mirror dir,
    dropping stale mirrors of skills that no longer exist at the source
    (packaged skills are never touched)."""
    skills = mirrored_skills()
    for mirror in SKILLS_MIRRORS:
        mirror.mkdir(parents=True, exist_ok=True)
        for existing in mirror.iterdir():
            if existing.is_dir() and existing.name not in PACKAGED_SKILLS and existing.name not in skills:
                shutil.rmtree(existing)
        for skill in skills:
            dst = mirror / skill
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(SKILLS_SOURCE / skill, dst)
            print(f"Synced {dst} <- {SKILLS_SOURCE / skill}")
