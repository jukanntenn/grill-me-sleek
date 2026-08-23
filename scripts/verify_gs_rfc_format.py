#!/usr/bin/env python3
# Every GS-RFC follows one format (see .agents/gs-rfcs/README.md):
# filename yyyy-mm-dd-topic-title.md under a lifecycle directory, a
# `# GS-RFC: <title>` header with a Status line agreeing with that
# directory, the lifecycle's exact section skeleton, and a mandatory
# `## Alternatives considered` with at least one bold-led alternative.
# Proposal-era headings are spec-speak and rejected in implemented/.
# Records are bilingual pairs; the twin follows the same skeleton with
# section headings in English, and its Status line matches the English
# side byte for byte. Part of doc_sync.py.
from __future__ import annotations

import re
import sys
from pathlib import Path

from doclib import ROOT, collect, restrict

LIFECYCLES = {"proposed", "implemented", "rejected"}
TREE_ROOT_FILES = {"README.md", "AGENTS.md", "README.zh.md", "AGENTS.zh.md"}
FILENAME = re.compile(r"^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*(\.zh)?\.md$")
TITLE = re.compile(r"^# GS-RFC: \S.+")
STATUS = re.compile(r"^Status: (proposed|implemented|rejected)(\s+—\s*\S.*)?$")

PROPOSED_SKELETON = ["Problem", "Proposal", "Alternatives considered", "Acceptance criteria", "Risks"]
IMPLEMENTED_SKELETON = ["Problem", "Decision", "Alternatives considered", "Consequences"]

GS_RFC_DIR = ".agents/gs-rfcs"


def _sections(lines: list[str]) -> list[str]:
    return [line[3:].strip() for line in lines if line.startswith("## ")]


def _status_line(lines: list[str]) -> str | None:
    for line in lines:
        if line.startswith("Status: "):
            return line
    return None


def find_violations(path: Path) -> list[str]:
    rel = path.relative_to(ROOT)
    lifecycle = path.relative_to(ROOT / GS_RFC_DIR).parts[0]
    out: list[str] = []

    if lifecycle not in LIFECYCLES:
        return [f"{rel}: lifecycle directory must be one of {sorted(LIFECYCLES)}"]
    if not FILENAME.match(path.name):
        out.append(f"{rel}: filename must be yyyy-mm-dd-topic-title.md (lowercase slug)")
    if path.name.endswith(".zh.md"):
        twin = path.with_name(path.name[: -len(".zh.md")] + ".md")
        if not twin.is_file():
            out.append(
                f"{rel}: a .zh.md record requires its English original {twin.name} in the same directory"
            )
            return out

    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or not TITLE.match(lines[0]):
        out.append(f"{rel}: line 1 must be `# GS-RFC: <title>`")
        return out

    status: str | None = None
    status_has_reason = False
    for line in lines[1:]:
        if line.startswith("Status: "):
            m = STATUS.match(line)
            if m:
                status = m.group(1)
                status_has_reason = m.group(2) is not None
            else:
                out.append(f"{rel}: malformed Status line: {line!r}")
                status = "malformed"

    if status is None:
        out.append(f"{rel}: missing `Status:` line in the header block")
    elif status != lifecycle and status != "malformed":
        out.append(f"{rel}: Status is {status!r} but the file sits in {lifecycle}/")

    sections = _sections(lines)
    if not sections or sections[0] != "Problem":
        out.append(f"{rel}: body must open with `## Problem`")

    if "Alternatives considered" not in sections:
        out.append(f"{rel}: mandatory `## Alternatives considered` section is missing")
    else:
        start = lines.index("## Alternatives considered")
        body = lines[start + 1 :]
        end = body.index(next(l for l in body if l.startswith("## "))) if any(
            l.startswith("## ") for l in body
        ) else len(body)
        if not any(l.lstrip().startswith("**") for l in body[:end]):
            out.append(
                f"{rel}: `## Alternatives considered` needs at least one bold-led alternative paragraph"
            )

    if lifecycle == "proposed" and sections != PROPOSED_SKELETON:
        out.append(
            f"{rel}: proposed skeleton is {PROPOSED_SKELETON} (found {sections})"
        )
    elif lifecycle == "implemented":
        if sections != IMPLEMENTED_SKELETON:
            out.append(
                f"{rel}: implemented skeleton is {IMPLEMENTED_SKELETON} (found {sections}); "
                "rewrite Proposal into present-tense Decision and fold Acceptance criteria/Risks into Consequences"
            )
    elif lifecycle == "rejected":
        if "Proposal" not in sections:
            out.append(
                f"{rel}: rejected records keep their `## Proposal` (the verdict lives on the Status line)"
            )
        if status == "rejected" and not status_has_reason:
            out.append(f"{rel}: a rejected record states its one-line reason on the Status line")

    if not path.name.endswith(".zh.md"):
        zh = path.with_name(path.name[: -len(".md")] + ".zh.md")
        if zh.is_file():
            zh_status = _status_line(zh.read_text(encoding="utf-8").splitlines())
            if zh_status != _status_line(lines):
                out.append(f"{rel}: Status line differs between the pair (must match byte for byte)")
    return out


def main(argv: list[str]) -> int:
    files = collect(
        [
            f"{GS_RFC_DIR}/proposed/*.md",
            f"{GS_RFC_DIR}/implemented/*.md",
            f"{GS_RFC_DIR}/rejected/*.md",
        ]
    )
    files = [f for f in files if f.name not in TREE_ROOT_FILES]
    if argv[1:]:
        files = restrict(files, argv[1:])

    strays = [
        str(p.relative_to(ROOT))
        for p in collect([f"{GS_RFC_DIR}/*.md", f"{GS_RFC_DIR}/**/*.md"])
        if p.name not in TREE_ROOT_FILES and p.parent.name not in LIFECYCLES
    ]

    problems: list[str] = []
    for path in files:
        problems.extend(find_violations(path))
    problems += [
        f"{s}: records live directly under {GS_RFC_DIR}/{{proposed,implemented,rejected}}/" for s in strays
    ]

    if problems:
        print(f"verify_gs_rfc_format: format violations (see {GS_RFC_DIR}/README.md):", file=sys.stderr)
        print("\n".join(f"  {p}" for p in problems), file=sys.stderr)
        return 1
    print(f"verify_gs_rfc_format: {len(files)} record(s) follow the format")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
