#!/usr/bin/env python3
"""The unified version train: which files carry the repo version, and how
to read and set it in each. Shared by the read-only gate
(scripts/verify_versions.py) and the mutating propagator
(scripts/sync-version.py) so the tool and the gates cannot disagree about
the member set. dsh/ rides its own version line and is deliberately not a
member; CHANGELOG.md is history, not a manifest."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parent.parent

# How each member kind is rewritten in place: surgical text edits, never a
# full re-serialization, so propagation cannot reformat anything.
Setter = Callable[[str, str], tuple[str, bool]]

# Cargo [package] version (first line-start `version = "..."`).
_CARGO_VERSION = re.compile(r'^version\s*=\s*"([^"]+)"', re.MULTILINE)
# shields.io badge: every '-' in the version is escaped as '--'
# (0.2.0-rc.4 renders as version-0.2.0--rc.4-brightgreen).
_BADGE_VERSION = re.compile(r"badge/version-([^-]+(?:--[^-]+)*)-brightgreen")
# A `"version": "..."` value in a JSON manifest. The package's own version
# is the first occurrence: none of the train manifests carries an earlier
# nested "version" key.
_JSON_VERSION = re.compile(r'("version"\s*:\s*")[^"]*(")')


def _read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return None


def _json_version(path: Path) -> str | None:
    text = _read_text(path)
    if text is None:
        return None
    try:
        data = json.loads(text)
    except ValueError:
        return None
    version = data.get("version")
    return version if isinstance(version, str) and version else None


def _marketplace_version(path: Path) -> str | None:
    text = _read_text(path)
    if text is None:
        return None
    try:
        data = json.loads(text)
    except ValueError:
        return None
    plugins = data.get("plugins")
    # Single-entry collection today; a second plugin needs its own line.
    if not isinstance(plugins, list) or not plugins:
        return None
    version = plugins[0].get("version")
    return version if isinstance(version, str) and version else None


def _cargo_version(path: Path) -> str | None:
    text = _read_text(path)
    if text is None:
        return None
    match = _CARGO_VERSION.search(text)
    return match.group(1) if match else None


def _badge_version(path: Path) -> str | None:
    text = _read_text(path)
    if text is None:
        return None
    match = _BADGE_VERSION.search(text)
    return match.group(1).replace("--", "-") if match else None


def set_json_version(text: str, version: str) -> tuple[str, bool]:
    new = _JSON_VERSION.sub(lambda m: m.group(1) + version + m.group(2), text, count=1)
    return new, new != text


def set_cargo_version(text: str, version: str) -> tuple[str, bool]:
    new = _CARGO_VERSION.sub(lambda m: f'version = "{version}"', text, count=1)
    return new, new != text


def set_badge_version(text: str, version: str) -> tuple[str, bool]:
    escaped = escape_badge(version)
    new = _BADGE_VERSION.sub(lambda m: f"badge/version-{escaped}-brightgreen", text, count=1)
    return new, new != text


# The train: (path, reader, setter). package.json is the anchor — the
# version is edited there and propagated to the rest by sync-version.py.
Member = tuple[str, Callable[[Path], str | None], Setter]

TRAIN: list[Member] = [
    ("package.json", _json_version, set_json_version),
    ("cli/package.json", _json_version, set_json_version),
    ("web/package.json", _json_version, set_json_version),
    ("e2e/package.json", _json_version, set_json_version),
    ("server/Cargo.toml", _cargo_version, set_cargo_version),
    (".claude-plugin/plugin.json", _json_version, set_json_version),
    (".claude-plugin/marketplace.json", _marketplace_version, set_json_version),
    ("README.md", _badge_version, set_badge_version),
    ("README.zh.md", _badge_version, set_badge_version),
]

ANCHOR = "package.json"


def read_train() -> list[tuple[str, str | None]]:
    """Every member with the version it currently carries (None = the
    reader could not find one)."""
    return [(rel, reader(ROOT / rel)) for rel, reader, _ in TRAIN]


def normalize(value: str) -> str:
    """Make tag, manifest, and badge spellings comparable: git tags carry
    a leading 'v' (badge '--' escaping is already undone by the reader)."""
    return value.strip().removeprefix("v")


def escape_badge(version: str) -> str:
    """Inverse of the badge reader's unescaping."""
    return version.replace("-", "--")
