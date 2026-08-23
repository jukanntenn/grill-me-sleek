#!/usr/bin/env python3
# Relative Markdown links must resolve: the target file must exist, and
# a #fragment must name a real heading slug (or explicit <a id>) in the
# target. Scheme-qualified and root-absolute URLs are out of scope.
# Part of doc_sync.py.
from __future__ import annotations

import sys
from pathlib import Path
from urllib.parse import unquote

from doclib import (
    ROOT,
    corpus,
    document_anchors,
    extract_links,
    is_external,
    mask_source,
    restrict,
)


def check(path: Path) -> list[str]:
    rel = path.relative_to(ROOT)
    text = path.read_text(encoding="utf-8")
    masked = mask_source(text)
    anchors = document_anchors(masked)
    problems: list[str] = []
    for link in extract_links(masked):
        url = link.url
        if is_external(url):
            continue
        target_part, _, fragment = url.partition("#")
        if target_part:
            target = (path.parent / unquote(target_part)).resolve()
            if not target.is_file():
                problems.append(f"{rel}:{link.line}: link target does not exist: {url}")
                continue
            if fragment:
                target_anchors = document_anchors(
                    mask_source(target.read_text(encoding="utf-8"))
                )
                if fragment not in target_anchors:
                    problems.append(
                        f"{rel}:{link.line}: fragment #{fragment} not found in "
                        f"{target.relative_to(ROOT)}"
                    )
        elif fragment and fragment not in anchors:
            problems.append(f"{rel}:{link.line}: fragment #{fragment} not found in {rel}")
    return problems


def main(argv: list[str]) -> int:
    files = corpus()
    if argv[1:]:
        files = restrict(files, argv[1:])
    problems: list[str] = []
    for path in files:
        problems.extend(check(path))
    if problems:
        print("verify_md_links: broken links found:", file=sys.stderr)
        print("\n".join(f"  {p}" for p in problems), file=sys.stderr)
        return 1
    print(f"verify_md_links: every relative link in {len(files)} file(s) resolves")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
