---
name: release
description: >
  Execute the grill-me-sleek release process. Use this skill when the user wants to
  publish a new version, create a release, bump version numbers, or says things like
  "release v0.2.0", "publish a new version", "cut a release", "ship it", or "prepare
  release". Also use when the user mentions CHANGELOG updates combined with version
  bumping in this project.
---

# Release Process

Safe release workflow for grill-me-sleek. Every step validates before proceeding; failures report the problem + suggestion then STOP — never auto-fix.

## Prerequisites

Verify clean tree and identify current state:

```bash
git status                         # must be clean
python3 scripts/verify_versions.py # current version, whole train (must already be consistent)
git describe --tags --abbrev=0 2>/dev/null || echo "NO_TAGS"  # last tag (may not exist yet)
```

If `NO_TAGS` — this is the first release. Use the initial commit (`git rev-list --max-parents=0 HEAD`) as the baseline for CHANGELOG generation.

## Steps 1–4: Preparation Phase

### Step 1: Quality Checks

Verify that CI is green on the latest commit. The project has multi-language CI (Rust server, TypeScript web/CLI):

```bash
# Quick local checks (if toolchains are available)
cd server && cargo fmt --check && cargo clippy -- -D warnings && cargo test && cd ..
cd cli && pnpm install --frozen-lockfile && pnpm lint && pnpm test && cd ..
cd web && pnpm install --frozen-lockfile && pnpm lint && pnpm test && cd ..
```

If any check fails → report which check failed + the specific violations, STOP.

### Step 2: Version Bump

1. Show commits since last tag (or since initial commit if no tags):
   ```bash
   git log --oneline <last_tag_or_initial>..HEAD
   ```
2. **Determine version number:**
   - If the user provided a version number → **validate it:**
     1. Semver format: `X.Y.Z` or `X.Y.Z-<prerelease>` (e.g. `0.2.0-rc.4`), X/Y/Z non-negative integers
     2. Higher than current version (no downgrades)
     3. No skipped intermediate versions (e.g. 0.1.1 → 0.3.0 skips 0.2.0 → soft warning, NOT a blocker)
     4. Tag does not already exist (`git tag -l "vX.Y.Z"` / `git tag -l "vX.Y.Z-rc.N"` must be empty)
     - Present validation results as **non-binding suggestions** — the user may override any warning.
   - If the user did NOT provide a version → recommend one based on semver principles (patch=fixes, minor=features, major=breaking), using your best judgment. **Show your reasoning** (e.g. "3 feat + 2 fix commits since v0.1.1 → recommending minor bump to 0.2.0").
3. **PAUSE — confirm version number.** Present the chosen version + reasoning/validation results and wait for explicit user confirmation. Do NOT proceed until the user gives a clear affirmative response (e.g. ok / 确认 / yes / 行 / 好的 / LGTM / 没问题 / 可以 / proceed / confirm).

   **⚠️ Anti-ambiguity rule:** You MUST NOT interpret silence, vague acknowledgments, or topic-adjacent replies as consent. Only explicit affirmative words count. When in doubt, ask.

4. Bump the **unified version train** with the confirmed version:
   1. Edit `"version"` in the root `package.json` — the anchor of the train.
   2. Propagate to the whole train (member set lives in `scripts/versionlib.py`,
      shared with the gates):
      ```bash
      python3 scripts/sync-version.py
      ```
      This rewrites `cli/`, `web/`, `e2e/` `package.json`, `server/Cargo.toml`,
      `.claude-plugin/plugin.json` + `marketplace.json`, and the `README.md` /
      `README.zh.md` badges (shields.io `-` → `--` escaping handled for you).
   3. Refresh `server/Cargo.lock` for the new Cargo version —
      `cargo clippy --locked` fails the commit otherwise:
      ```bash
      cd server && cargo update -p grilling-sleek && cd ..
      ```
5. Verify the train is consistent (the prek `version-sync` hook re-runs this at
   commit — surface failures now, not mid-ceremony):
   ```bash
   python3 scripts/verify_versions.py
   ```

### Step 3: Update CHANGELOG

1. Derive changes from `git log --oneline <last_tag_or_initial>..HEAD`
2. If `CHANGELOG.md` does not exist yet, create it with header:
   ```
   # Changelog

   ```
3. Draft entry matching this format, present to user for review, then insert at TOP (after `# Changelog` header + blank line):

   ```
   ## [X.Y.Z] - YYYY-MM-DD

   ### Added
   - ...
   ### Changed
   - ...
   ### Fixed
   - ...
   ```

   Omit empty sections. Keep `# Changelog` header + blank line at the top.

   **Writing style — user-facing, not developer-facing:**
   - Each entry is **one sentence describing what the user experiences**, not what the code does.
   - ✅ Good: "Questions load faster — no more waiting for all questions before the first one appears."
   - ❌ Bad: "Split client into non-blocking push and wait."
   - ❌ Bad: "Refactored question rendering pipeline."
   - Do NOT mention implementation details (function names, architecture, internal APIs).
   - **Completely omit** chore commits, CI changes, internal refactorings, and dependency updates unless they directly affect what users see or do.

4. Verify the entry was inserted correctly (first section after header).

### Step 4: README Consistency Check

Compare `README.md` and `README_zh.md` for conflicting or contradictory information:
- Version badges must match
- Feature descriptions must agree (content may differ in detail, but must not contradict)
- Install commands must be identical
- Platform status table must match

If inconsistencies found → report them to the user and STOP.

---

## PAUSE — User Confirmation Required

Present summary:

```
Steps 1–4 complete:
- Version: X.Y.Z across the whole train (package.json + components + Cargo.toml + plugin/marketplace + README badges; verify_versions.py green)
- CHANGELOG: updated
- READMEs: verified consistent

Ready to commit and publish? Confirm to continue.
```

Do NOT proceed until the user gives a **clear affirmative response** (e.g. ok / 确认 / yes / 行 / 好的 / LGTM / 没问题 / 可以 / proceed / confirm). If the user objects or requests changes, address them and re-present the updated summary.

**⚠️ Anti-ambiguity rule:** You MUST NOT interpret silence, vague acknowledgments, or topic-adjacent replies as consent. Only explicit affirmative words count. When in doubt, ask.

---

## Steps 5–8: Commit & Publish Phase

### Step 5: Verify Release Workflow

```bash
cat .github/workflows/release.yml
```

The workflow MUST have:
- Trigger on `v*` tags
- CHANGELOG extraction step (awk to extract version-specific notes)
- `softprops/action-gh-release` with `body_path` pointing to extracted notes

If the file is missing or incomplete → create/fix it, explain what was done, and ask user to confirm before continuing.

### Step 6: Commit

```bash
git add package.json cli/package.json web/package.json e2e/package.json \
  server/Cargo.toml server/Cargo.lock \
  .claude-plugin/plugin.json .claude-plugin/marketplace.json \
  README.md README.zh.md CHANGELOG.md .github/workflows/release.yml
git commit -m "chore: release vX.Y.Z"
```

Verify: `git log --oneline -1` shows the commit, `git status` is clean.
Hook failure → report output, STOP. Never `--no-verify`.

### Step 7: Tag

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z"
```

Verify: `git tag -l "vX.Y.Z"` returns exactly the tag. If tag already exists → report, STOP.

### Step 8: Push

Confirm with user first — **destructive, visible to others**:

```bash
git push && git push --tags
```

Then provide monitoring URL: `https://github.com/jukanntenn/grill-me-sleek/actions/workflows/release.yml`

Rejected → report error, STOP. Never force push.

---

## Step 9: Post-Release Verification

Provide user with:

1. **GitHub Release**: check body matches CHANGELOG entry
   → `https://github.com/jukanntenn/grill-me-sleek/releases/tag/vX.Y.Z`
2. **Version checklist**: `python3 scripts/verify_versions.py --expect vX.Y.Z` green — the whole train carries the release; the publish workflows' `verify` job already enforced this before any artifact went out
3. **Rollback options**:
   - Delete the tag: `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`
   - Edit the GitHub Release manually via the web UI
   - Delete and re-create the Release via the web UI
   - If commit hasn't been pushed yet, `git reset --soft HEAD~1` to undo the release commit
