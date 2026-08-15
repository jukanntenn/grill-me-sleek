---
name: commit
description: Use when the user asks to commit or stage changes (commit/stage/save/submit), when a task ends with dirty files to commit, or when multiple files should be split into logical commits.
---

# Commit

Group by logical change, not by file. Draft a plan, confirm, then execute. Never push, never amend.

1. `git status --porcelain` + `git log --oneline -5` for current changes and history style.
2. Separate AI-edited files from unrecognized ones; list unrecognized separately, never mix them in.
3. Group by logical unit (handler+db+test in server, page+component+types in web, cli flag+parse+help); a feature spanning server+web+cli is one unit when the parts are meaningless alone. Order: `build/chore` → `feat` → `fix` → `refactor` → `style` → `docs` → `test`, `release` last.
4. Present the plan once; after confirmation run `git add` + `git commit` batch by batch. Rejected → stop.
5. Verify before each commit: run the touched package's tests (`cd server && cargo test`, `cd web|cli && pnpm test`); the prek hooks (cargo fmt/clippy, eslint/tsc, prettier, sqlx-check) run on `git commit` — never `--no-verify`.
6. Single file → skip the plan, commit directly.

Message: `<type>(<scope>): <desc>` — lowercase, imperative, no trailing period. Types: `feat`/`fix`/`refactor`/`docs`/`test`/`chore`/`ci`/`build`/`style`/`perf`/`revert`. Scopes: `server`/`web`/`cli`/`e2e` (components), `docker`/`devops`/`github` (infra); omit for root-level changes. Match the change's language.

- Generated files (`server/.sqlx/`, `pnpm-lock.yaml`, `Cargo.lock`) bundle into the producing commit, or as a standalone `chore` — regenerate (`python3 scripts/migrate.py prepare`, `pnpm install`, cargo build), never hand-edit.
- A migration, the `server/src/db/` code that uses it, and the regenerated `.sqlx/` cache are one unit — the sqlx-check hook fails if they drift apart.
- Version bump (plugin.json, marketplace.json, README badges) + CHANGELOG entry = one `chore: release vX.Y.Z` commit (see the release skill).
- Template + code, and config + code, stay together when the code depends on them; mixed-language docs (`README.md` + `README_zh.md`) one commit.
- Never silently include unrecognized files. Never amend, never push, never placeholder messages (wip, update files).
