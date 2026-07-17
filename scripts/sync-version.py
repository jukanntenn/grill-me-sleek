#!/usr/bin/env python3
"""
Sync version from root package.json to all components.

Usage:
    python scripts/sync-version.py [--dry-run]

This script reads the version from the root package.json and syncs it to:
- cli/package.json
- web/package.json
- server/Cargo.toml
"""

import json
import re
import sys
from pathlib import Path


def get_project_root() -> Path:
    """Get the project root directory."""
    return Path(__file__).parent.parent


def read_version_from_package_json(root: Path) -> str:
    """Read version from root package.json."""
    package_json = root / "package.json"
    if not package_json.exists():
        print(f"Error: {package_json} not found", file=sys.stderr)
        sys.exit(1)

    with open(package_json, "r") as f:
        data = json.load(f)

    version = data.get("version")
    if not version:
        print("Error: No version found in package.json", file=sys.stderr)
        sys.exit(1)

    return version


def update_package_json(file_path: Path, version: str, dry_run: bool = False) -> bool:
    """Update version in a package.json file."""
    if not file_path.exists():
        print(f"Warning: {file_path} not found, skipping", file=sys.stderr)
        return False

    with open(file_path, "r") as f:
        data = json.load(f)

    old_version = data.get("version")
    if old_version == version:
        print(f"✓ {file_path.relative_to(get_project_root())} already at version {version}")
        return True

    if dry_run:
        print(f"✓ {file_path.relative_to(get_project_root())}: {old_version} → {version} (dry run)")
        return True

    data["version"] = version
    with open(file_path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

    print(f"✓ {file_path.relative_to(get_project_root())}: {old_version} → {version}")
    return True


def update_cargo_toml(file_path: Path, version: str, dry_run: bool = False) -> bool:
    """Update version in Cargo.toml."""
    if not file_path.exists():
        print(f"Warning: {file_path} not found, skipping", file=sys.stderr)
        return False

    with open(file_path, "r") as f:
        content = f.read()

    # Match version = "x.y.z" in [package] section
    pattern = r'^(version\s*=\s*)"[^"]*"'
    replacement = f'\\1"{version}"'

    new_content, count = re.subn(pattern, replacement, content, count=1, flags=re.MULTILINE)

    if count == 0:
        print(f"Warning: No version field found in {file_path}", file=sys.stderr)
        return False

    if dry_run:
        print(f"✓ {file_path.relative_to(get_project_root())}: version → {version} (dry run)")
        return True

    with open(file_path, "w") as f:
        f.write(new_content)

    print(f"✓ {file_path.relative_to(get_project_root())}: version → {version}")
    return True


def main():
    dry_run = "--dry-run" in sys.argv

    root = get_project_root()
    version = read_version_from_package_json(root)

    print(f"📦 Syncing version: {version}")
    if dry_run:
        print("(dry run mode)")
    print()

    success = True

    # Update cli/package.json
    success &= update_package_json(root / "cli" / "package.json", version, dry_run)

    # Update web/package.json
    success &= update_package_json(root / "web" / "package.json", version, dry_run)

    # Update server/Cargo.toml
    success &= update_cargo_toml(root / "server" / "Cargo.toml", version, dry_run)

    print()
    if success:
        print(f"✅ Version {version} synced to all components")
    else:
        print("⚠️  Some components failed to update", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
