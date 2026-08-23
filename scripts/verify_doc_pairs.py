#!/usr/bin/env python3
# Every gated Markdown file is an equal-authority bilingual pair: foo.md
# with foo.zh.md beside it, updating together. Checked per pair: both
# files exist, a language-switcher line links the twin, the heading
# depth sequence mirrors, level-2 headings stay English (byte-identical)
# in the twin, fenced code blocks are byte-identical (examples are not
# translated), and the English side carries no Chinese prose outside
# code and the switcher line. Exemptions: scripts/
# doc_languages.manifest.json. Part of doc_sync.py.
from __future__ import annotations

import re
import sys
from pathlib import Path

from doclib import (
    ROOT,
    cjk_allowed,
    corpus,
    en_twin,
    fenced_blocks,
    headings,
    mask_source,
    restrict,
    zh_twin,
)

CJK_ANY = re.compile("[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]")


def _content_head(text: str, n: int = 8) -> list[str]:
    """First n lines of content, skipping a YAML frontmatter block."""
    if text.startswith("---\n"):
        closing = text.find("\n---", 4)
        if closing != -1:
            end = text.find("\n", closing + 4)
            text = text[end + 1 :] if end != -1 else ""
    return text.split("\n")[:n]


def check_pair(en: Path, zh: Path) -> list[str]:
    rel = en.relative_to(ROOT)
    problems: list[str] = []
    t_en = en.read_text(encoding="utf-8")
    t_zh = zh.read_text(encoding="utf-8")

    if not any(
        re.search(rf"\[中文\]\([^)]*{re.escape(zh.name)}\)", line)
        for line in _content_head(t_en)
    ):
        problems.append(f"{rel}: no language switcher linking {zh.name} near the top")
    if not any(
        re.search(rf"\[English\]\([^)]*{re.escape(en.name)}\)", line)
        for line in _content_head(t_zh)
    ):
        problems.append(
            f"{zh.relative_to(ROOT)}: no language switcher linking {en.name} near the top"
        )

    h_en, h_zh = headings(t_en), headings(t_zh)
    if [d for d, _ in h_en] != [d for d, _ in h_zh]:
        problems.append(f"{rel}: heading depth sequence differs from the twin")
    l2_en = [t for d, t in h_en if d == 2]
    l2_zh = [t for d, t in h_zh if d == 2]
    if l2_en != l2_zh:
        problems.append(
            f"{rel}: level-2 headings must stay English and byte-identical in the twin"
        )

    if fenced_blocks(t_en) != fenced_blocks(t_zh):
        problems.append(f"{rel}: fenced code blocks differ from the twin (byte-identical required)")

    if rel.as_posix() not in cjk_allowed():
        switcher = re.compile(rf"\[中文\]\([^)]*{re.escape(zh.name)}\)")
        for lineno, line in enumerate(mask_source(t_en).split("\n"), start=1):
            if switcher.search(line):
                continue
            if CJK_ANY.search(line):
                problems.append(
                    f"{rel}:{lineno}: Chinese text in the English file — move it to the twin"
                )
                break
    return problems


def main(argv: list[str]) -> int:
    files = corpus()
    if argv[1:]:
        files = restrict(files, argv[1:])
    file_set = set(files)

    problems: list[str] = []
    english_side = [f for f in files if not f.name.endswith(".zh.md")]
    for f in files:
        if f.name.endswith(".zh.md") and en_twin(f) not in file_set:
            problems.append(
                f"{f.relative_to(ROOT)}: missing English original {en_twin(f).name}"
            )
    pairs: list[tuple[Path, Path]] = []
    for en in english_side:
        zh = zh_twin(en)
        if zh not in file_set:
            problems.append(f"{en.relative_to(ROOT)}: missing Chinese twin {zh.name}")
        else:
            pairs.append((en, zh))

    for en, zh in pairs:
        problems.extend(check_pair(en, zh))

    if problems:
        print("verify_doc_pairs: bilingual pair violations found:", file=sys.stderr)
        print("\n".join(f"  {p}" for p in problems), file=sys.stderr)
        return 1
    print(f"verify_doc_pairs: {len(pairs)} pair(s) complete, mirrored, and pure")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
