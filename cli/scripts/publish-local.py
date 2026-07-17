#!/usr/bin/env python3
"""
Publish @grilling-sleek/cli to local npm registry.

Prerequisites:
    1. Start verdaccio: npx verdaccio
    2. Login: npm adduser --registry http://localhost:4873/

Usage:
    python cli/scripts/publish-local.py [version]

If version is not provided, it will be extracted from root package.json.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path


def get_project_root() -> Path:
    """Get the project root directory."""
    return Path(__file__).parent.parent.parent


def get_cli_dir() -> Path:
    """Get the CLI directory."""
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


def update_package_version(cli_dir: Path, version: str) -> None:
    """Update version in cli/package.json."""
    package_json = cli_dir / "package.json"
    with open(package_json, "r") as f:
        data = json.load(f)

    data["version"] = version
    with open(package_json, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

    print(f"✓ Updated version to {version}")


def run_command(cmd: list[str], cwd: Path = None) -> subprocess.CompletedProcess:
    """Run a command and return the result."""
    result = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True
    )
    return result


def main():
    # Get directories
    project_root = get_project_root()
    cli_dir = get_cli_dir()

    # Get version from argument or package.json
    if len(sys.argv) > 1:
        version = sys.argv[1]
    else:
        version = read_version_from_package_json(project_root)

    # Get local registry URL
    local_registry = os.environ.get("NPM_REGISTRY", "http://localhost:4873/")

    print("=" * 50)
    print("Publishing @grilling-sleek/cli to local registry")
    print("=" * 50)
    print(f"CLI Directory: {cli_dir}")
    print(f"Registry: {local_registry}")
    print(f"Version: {version}")
    print()

    # Step 1: Update version in package.json
    print("Step 1: Updating version in package.json")
    update_package_version(cli_dir, version)

    # Step 2: Build production bundle
    print("\nStep 2: Building production bundle")
    result = run_command(
        ["node", "esbuild.config.mjs"],
        cwd=cli_dir,
        env={**os.environ, "NODE_ENV": "production"}
    )
    if result.returncode != 0:
        print(f"Error building bundle: {result.stderr}", file=sys.stderr)
        sys.exit(1)
    print("✓ Build completed")

    # Step 3: Check bundle size
    print("\nStep 3: Bundle statistics")
    bundle_path = cli_dir / "dist" / "grilling-sleek.js"
    if bundle_path.exists():
        size_bytes = bundle_path.stat().st_size
        if size_bytes < 1024:
            size_str = f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            size_str = f"{size_bytes / 1024:.1f} KB"
        else:
            size_str = f"{size_bytes / (1024 * 1024):.1f} MB"
        print(f"Bundle size: {size_str}")
    else:
        print("Warning: Bundle not found", file=sys.stderr)

    # Step 4: Unpublish existing package (for local testing)
    print("\nStep 4: Unpublishing existing package from local registry")
    result = run_command(
        ["npm", "unpublish", "--force", "@grilling-sleek/cli", "--registry", local_registry],
        cwd=cli_dir
    )
    if result.returncode == 0:
        print("✓ Unpublished existing package")
    else:
        print("  (package not found or already unpublished)")

    # Step 5: Publish to local registry
    print("\nStep 5: Publishing to local registry")
    result = run_command(
        ["npm", "publish", "--registry", local_registry, "--access", "public"],
        cwd=cli_dir
    )
    if result.returncode != 0:
        print(f"Error publishing: {result.stderr}", file=sys.stderr)
        sys.exit(1)

    print("\n" + "=" * 50)
    print("✅ Published successfully!")
    print("=" * 50)
    print()
    print("Test with:")
    print(f"  npm install -g @grilling-sleek/cli --registry={local_registry}")
    print()
    print("Or run directly:")
    print(f"  npx @grilling-sleek/cli --registry={local_registry} --help")


if __name__ == "__main__":
    main()
