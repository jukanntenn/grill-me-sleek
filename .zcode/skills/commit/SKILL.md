---
name: commit
description: "Split and organize AI code changes into well-structured commits following this project's conventions. Use this skill whenever committing changes — whether one file or many. Trigger when the user asks to commit, save, submit, or stage changes, or when dirty files need committing after a task. Also use when multiple files were edited and need logical grouping into separate commits, or when the user asks about commit conventions for this project."
---

One big commit is a black box — you can't bisect, can't cherry-pick, and can't tell "which change broke what." Split commits give you:

- **`git bisect`** works — each commit is either good or bad, no mixed states
- **`git revert`** is safe — revert one logical change without pulling out others
- **Reviewable history** — humans and AI can audit what happened, in order
- **Rollback confidence** — if a refactor broke something, revert just the refactor

## Design principles

- **Split granularity — group by logical change unit**
  A logical change unit is a set of file edits that together accomplish one coherent purpose. We do this instead of per-file splitting because this project's files are tightly coupled (server.py ↔ template.html ↔ SKILL.md form one skill). Per-file would create meaningless fragments; per-TDD-stage is overkill for a small project.

- **Who decides grouping — AI drafts plan, human confirms**
  The AI inspects dirty state and proposes a commit plan, but the human has final say. This balances automation speed with human oversight over their own git history.

- **Commit message format — Conventional Commits, match existing history**
  Our history already uses `feat(grill-me-sleek):`, `fix(...)`, `ci(...)`, `chore:`, `docs:`. Staying consistent makes `git log` readable and predictable.

- **Verification gate — lint + test must pass before each commit**
  We have `ruff check` + `ruff format` + `pytest` in CI. Running them before commit catches issues early and saves CI round-trips.

- **Push policy — never auto-push**
  Pushing is an irreversible outward-facing action. The user always decides when to push.

## Rules

### 1. Group by logical change, not by file

A "logical change unit" is a set of file edits that together accomplish one coherent purpose. Examples:

| Logical change                  | Files                                | Rationale                                              |
| ------------------------------- | ------------------------------------ | ------------------------------------------------------ |
| Add multi-select support        | server.py + template.html + SKILL.md | Feature spans backend, frontend, and docs — one commit |
| Fix a CSS padding bug           | template.html only                   | Isolated fix — one commit                              |
| Update CI to add Python 3.13    | ci.yml only                          | CI change — one commit                                 |
| Bump version + update CHANGELOG | pyproject.toml + CHANGELOG.md        | Release housekeeping — always together                 |

### 2. Ordering: infrastructure → feature → fix → docs → chore

When multiple commits are needed, follow this order:

```
1. chore / ci        — build system, dependencies, tooling
2. feat              — new features
3. fix               — bug fixes
4. refactor          — code reorganization
5. docs              — README, CHANGELOG, comments
6. test              — test additions/changes
7. chore(release)    — version bump, changelog update (always last)
```

Rationale: infrastructure changes first (they're prerequisites), features and fixes in the middle (the actual work), docs and release housekeeping last (they describe what happened).

### 3. Commit message format

```
<type>(<scope>): <description>
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `perf`

**Scopes:** `grill-me-sleek` (skill code), `ui` (template/CSS), `github` (CI/release), or omit scope for root-level changes.

**Rules:**

- Lowercase description, no trailing period
- Match the language of the change (Chinese files → Chinese message, English → English)
- Imperative mood: "add" not "added", "fix" not "fixed"

**Examples from our history:**

```
feat(ui): optimize web UI for natural, soft, and efficient review
fix(grill-me-sleek): avoid session collisions across different Claude instances
ci(github): add changelog check and set latest release flag
chore: release v0.1.1
```

### 4. Verification gate — lint & test before commit

Before every commit, run:

```bash
uv run ruff check . && uv run ruff format --check . && uv run pytest
```

If anything fails → fix first, then commit. Never commit failing code.

### 5. The commit plan protocol

When multiple files are dirty, the AI **must**:

1. **Inspect dirty state:** `git status --porcelain`
2. **Learn existing style:** `git log --oneline -5`
3. **Classify files:**
   - **AI-edited this session** — files the AI wrote/edited
   - **Unrecognized** — files the AI didn't touch (user edits, other tools)
4. **Draft a commit plan** grouping AI-edited files into logical commits
5. **Present the plan once** for human confirmation:

```
Proposed commits (in order):
  1. feat(grill-me-sleek): add multi-select question support
     - skills/grill-me-sleek/server.py
     - skills/grill-me-sleek/template.html
     - skills/grill-me-sleek/SKILL.md
  2. docs: update README with multi-select example
     - README.md
     - README_zh.md

Unrecognized dirty files (NOT in any commit):
  - .gitignore

Reply 'ok' / '行' to execute. Reply with edits, or '我自己来' / 'manual' to abort.
```

6. **On confirmation:** execute `git add` + `git commit` for each batch in order. No `--amend`. No push.
7. **On rejection:** stop. Do not propose a second plan. Let the user commit manually.

### 6. Special cases

| Case                                                      | Rule                                                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Only one file changed**                                 | Skip the plan protocol — commit directly with a descriptive message                                  |
| **Release commit**                                        | Version bump in `pyproject.toml` + CHANGELOG entry = always one commit, type `chore: release vX.Y.Z` |
| **Generated/trivial changes** (ruff auto-fix, .gitignore) | Bundle with the commit that caused them, or a single `chore` commit if standalone                    |
| **Mixed language edits** (e.g., README.md + README_zh.md) | Keep in one commit if they describe the same change                                                  |
| **Scope-only change** (SKILL.md prompt wording)           | One commit with scope `grill-me-sleek`                                                               |

### 7. What NOT to do

- ❌ **One giant commit** for everything — defeats the purpose
- ❌ **Per-file commits** when files are logically coupled (server.py + template.html = one feature)
- ❌ **Commit with failing tests** — always verify first
- ❌ **`git commit --amend`** — never rewrite history
- ❌ **`git push`** without explicit user request
- ❌ **Include unrecognized dirty files** silently — always list them separately
- ❌ **Placeholder commit messages** like "wip" or "update files"

## Quick reference

```
1. git status --porcelain          → what changed?
2. git log --oneline -5            → what style?
3. Group by logical change          → plan commits
4. Present plan → human confirms   → one shot
5. ruff check + format + pytest    → verify BEFORE each commit
6. git add + git commit            → execute in order
7. Never push, never amend
```
