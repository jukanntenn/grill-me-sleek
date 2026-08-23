#!/usr/bin/env python3
"""Shared stdlib-only helpers for the documentation gates.

The gated corpus is every Markdown file git knows about — tracked or
untracked-but-not-ignored, so .gitignore (not each gate) decides what is
invisible — minus the exemptions in doc_languages.manifest.json. Exempt
files (ledgers, vendored material, packaged skills, agent-tool config)
carry no gate opinions at all.

Masked regions (fenced code blocks, inline code spans, frontmatter) are
replaced with filler of the same shape so a line number computed on
masked text still addresses the original file.
"""
from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

_FRONTMATTER = re.compile(r"\A---\n.*?\n---\n", re.DOTALL)


def _manifest() -> dict:
    path = ROOT / "scripts" / "doc_languages.manifest.json"
    return json.loads(path.read_text(encoding="utf-8"))


def exempt_patterns() -> list[re.Pattern]:
    return [re.compile(p) for p in _manifest()["exempt"]]


def cjk_allowed() -> set[str]:
    return set(_manifest().get("cjk_allowed", []))


def git_files() -> list[Path]:
    """Tracked plus untracked-not-ignored files; gitignore respected."""
    proc = subprocess.run(
        ["git", "-C", str(ROOT), "ls-files", "--cached", "--others", "--exclude-standard"],
        capture_output=True,
        text=True,
        check=True,
    )
    return [ROOT / line for line in proc.stdout.splitlines() if line]


def corpus(files: list[Path] | None = None) -> list[Path]:
    """The gated Markdown corpus, sorted and deduped."""
    patterns = exempt_patterns()
    skip_segments = {".git", ".local", "node_modules", "target", "dist", "__pycache__"}
    out: set[Path] = set()
    for p in files if files is not None else git_files():
        if p.suffix != ".md" or not p.is_file():
            continue
        if any(seg in skip_segments for seg in p.parts):
            continue
        rel = p.relative_to(ROOT).as_posix()
        if any(rx.search(rel) for rx in patterns):
            continue
        out.add(p)
    return sorted(out)


def collect(patterns: list[str]) -> list[Path]:
    """Repo-relative files matching the glob patterns, deduped, sorted."""
    seen: set[Path] = set()
    for pattern in patterns:
        seen.update(p for p in ROOT.glob(pattern) if p.is_file())
    return sorted(seen)


def restrict(files: list[Path], given: list[str]) -> list[Path]:
    """Intersection of a gate's scope with explicitly requested paths."""
    wanted = {ROOT / g for g in given}
    return [f for f in files if f in wanted and f.is_file()]


def zh_twin(path: Path) -> Path:
    """foo.md -> foo.zh.md (identity for already-zh paths)."""
    if path.name.endswith(".zh.md"):
        return path
    return path.with_name(path.name[: -len(".md")] + ".zh.md")


def en_twin(path: Path) -> Path:
    """foo.zh.md -> foo.md (identity for already-English paths)."""
    if path.name.endswith(".zh.md"):
        return path.with_name(path.name[: -len(".zh.md")] + ".md")
    return path


def mask_source(text: str) -> str:
    """Blank out frontmatter, fenced code blocks, and inline code spans.

    Newlines are preserved everywhere, so line numbers derived from the
    masked text address the original file.
    """
    if text.startswith("---\n"):
        closing = text.find("\n---", 4)
        if closing != -1:
            end = text.find("\n", closing + 4)
            text = _filler(text, 0, end if end != -1 else len(text))

    out: list[str] = []
    in_fence = False
    for line in text.split("\n"):
        if line.lstrip().startswith("```"):
            out.append(_filler(line, 0, len(line)))
            in_fence = not in_fence
        elif in_fence:
            out.append(_filler(line, 0, len(line)))
        else:
            # Inline code spans may contain [x](y) examples that are not
            # links; blank their contents, keep the backticks.
            out.append(re.sub(r"`[^`]*`", lambda m: _filler(m.group(0), 1, -1), line))
    return "\n".join(out)


def _filler(original: str, start: int, end: int) -> str:
    """Copy of original whose [start:end] slice is spaces (newlines kept)."""
    chars = list(original)
    stop = len(chars) if end == -1 else min(end, len(chars))
    for i in range(max(start, 0), stop):
        if chars[i] != "\n":
            chars[i] = " "
    return "".join(chars)


@dataclass
class Link:
    """One reference-style or inline link, image, or definition."""

    line: int
    url: str


_INLINE_LINK = re.compile(r"!?\\?\[([^\]]*)\]\(\s*(?:<([^<>]+)>|([^)\s]+))(?:\s+\"[^\"]*\")?\s*\)")
_DEFINITION = re.compile(r"^\s{0,3}\[([^\]]+)\]:\s*(?:<([^<>]+)>|(\S+))", re.MULTILINE)
_REF_USE = re.compile(r"\[([^\]]+)\]\[([^\]]+)\]")


def extract_links(masked: str) -> list[Link]:
    """Links, images, and definition targets in document order."""
    out: list[Link] = []
    definitions: dict[str, str] = {}
    for m in _DEFINITION.finditer(masked):
        url = m.group(2) or m.group(3) or ""
        definitions[m.group(1).strip().lower()] = url
        out.append(Link(masked.count("\n", 0, m.start()) + 1, url))

    for m in _INLINE_LINK.finditer(masked):
        url = m.group(2) or m.group(3) or ""
        out.append(Link(masked.count("\n", 0, m.start()) + 1, url))

    for m in _REF_USE.finditer(masked):
        url = definitions.get(m.group(2).strip().lower())
        if url is not None:
            out.append(Link(masked.count("\n", 0, m.start()) + 1, url))

    out.sort(key=lambda l: l.line)
    return out


def is_external(url: str) -> bool:
    """Scheme-qualified, protocol-relative, or root-absolute targets."""
    if url.startswith("//") or url.startswith("/"):
        return True
    return re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", url) is not None


def _render_inline(text: str) -> str:
    """Approximate rendered heading text: keep text, drop syntax."""
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"</?[^>]+>", "", text)
    return re.sub(r"[*_~]+$|^[*_~]+", "", text.strip())


_HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
_HTML_ANCHOR = re.compile(r'<a\s+id="([^"]+)')


def github_slug(heading: str) -> str:
    """GitHub's heading anchor: lowercase, drop non-word punctuation,
    spaces to hyphens (underscores survive, Unicode letters survive)."""
    slug = heading.lower()
    slug = re.sub(r"[^\w\- ]", "", slug, flags=re.UNICODE)
    return slug.replace(" ", "-")


def headings(text: str) -> list[tuple[int, str]]:
    """(depth, title) for every ATX heading, fences excluded."""
    out: list[tuple[int, str]] = []
    in_fence = False
    for line in text.split("\n"):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        m = _HEADING.match(line)
        if m:
            out.append((len(m.group(1)), m.group(2).strip()))
    return out


def fenced_blocks(text: str) -> list[str]:
    """Fenced code blocks (delimiters included) in document order."""
    out: list[str] = []
    current: list[str] | None = None
    for line in text.split("\n"):
        if current is None:
            if line.lstrip().startswith("```"):
                current = [line]
        else:
            current.append(line)
            if line.lstrip().startswith("```"):
                out.append("\n".join(current))
                current = None
    return out


def document_anchors(masked: str) -> set[str]:
    """Every fragment a Markdown document exposes: GitHub slugs for each
    heading (with -1/-2 collision suffixes) plus explicit <a id> values
    outside code and comments."""
    anchors: set[str] = set()
    seen: dict[str, int] = {}
    for line in masked.split("\n"):
        m = _HEADING.match(line)
        if m:
            base = github_slug(_render_inline(m.group(2)))
            candidate = base
            bump = seen.get(base, 0)
            while candidate in anchors:
                bump += 1
                candidate = f"{base}-{bump}"
            seen[base] = bump
            anchors.add(candidate)
        elif "<!--" not in line:
            anchors.update(_HTML_ANCHOR.findall(line))
    return anchors
