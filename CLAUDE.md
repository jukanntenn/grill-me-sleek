# AGENTS.md

English | [中文](AGENTS.zh.md)

> This file gives AI coding agents (Claude Code, Codex, ZCode, OpenCode, etc.)
> the operating rules for this repository. It is intentionally short, concrete,
> and command-first. `CLAUDE.md` is a direction-free byte-identical mirror
> (kept in sync by `scripts/sync_agents.py`). Subtree `AGENTS.md` files
> (`server/`, `web/`, `cli/`, `e2e/`, `specs/`) hold tree-specific orders and
> never repeat this file. Design and behavior principles live in
> [`PRINCIPLES.md`](PRINCIPLES.md).

## 1. Project Overview

**grill-me-sleek** stress-tests a plan before vibe coding: the agent asks
questions, you answer them in a sleek web UI. Three components, one repo:

| Component | Path       | Role                                                         |
| --------- | ---------- | ------------------------------------------------------------ |
| `server/` | Rust       | The "Hub" — REST API + SSE, SQLite-backed (axum + sqlx)      |
| `web/`    | TypeScript | React SPA served to the user for reviewing questions         |
| `cli/`    | TypeScript | Published to npm as `@grilling-sleek/cli`; bridges agent↔Hub |

## 2. Tech Stack

Server: Rust edition 2024 (MSRV 1.85), axum 0.8, sqlx 0.9 (sqlite, migrate,
sqlite-bundled), tokio 1. Web: React 19, Vite 8, TypeScript 5.9, Tailwind 4.3,
ESLint 9, Vitest 3.2, Prettier 3. CLI: TypeScript 5.9, esbuild 0.25. E2E:
Playwright 1.61. Quality gate: **prek** 0.4+ (workspace + groups). Package
manager: **pnpm 11** (per-package lockfiles; no workspace root install).

## 3. Commands

**prek is the single source of truth for all quality gating.** Every
format/lint/check lives in `prek.toml` (root) + `server|web|cli/prek.toml`.
CI runs the exact same hooks, so local green == CI green:

```
prek install                    # one-time: install git hooks
prek run --all-files            # everything (== CI gate)
prek run --group format --files <path>
python3 scripts/doc_sync.py     # documentation gates (staged files; none = all)
```

Per-tree commands (cargo, pnpm, playwright) live in the tree's `AGENTS.md`.
Repo-root tooling:

```
python3 scripts/migrate.py prepare|check|add   # sqlx .sqlx cache (see §9)
python3 docker/build.py [--push]               # build/push the main image
ansible-playbook devops/ansible/deploy.yml [-e target=production]
```

## 4. Project Structure

```
prek.toml        Workspace-root prek config (builtin checks, prettier-root,
                 actionlint, agents-sync, doc-check, commit-msg).
server/          Rust service. WRITE HERE for API/DB work (own AGENTS.md).
web/             React SPA. WRITE HERE for UI work (own AGENTS.md).
cli/             CLI tool. WRITE HERE for CLI work (own AGENTS.md).
e2e/             Playwright E2E vs docker-compose.local (own AGENTS.md).
specs/           Design reference + the documentation standard (AGENTS.md)
                 with an authoritative index (index.md).
docs/            Operations runbooks (bilingual; e.g. Cloudflare deployment).
tests/load/      Load-test suite and operational reports (exempt from doc
                 pairing).
docker/          Dockerfile + compose configs + build.py (Caddy → :8000).
devops/ansible/  Unified deploy.yml + group_vars/{staging,production}.
scripts/         Repo tooling, Python stdlib only.
skills/          Packaged grilling-sleek skill source (release artifact).
.agents/gs-rfcs/ Decision records (see §6). .agents|zcode/skills/ mirrors.
.claude/ .codex/ .zcode/ .opencode/   Agent-tool config, not source (§10).
```

## 5. Code Style

**prek defines every formatter/linter invocation** — there is no parallel
definition in CI or elsewhere. Generated files are exempt from fixers and
validated for freshness instead: `server/.sqlx/` (server:sqlx-check),
`pnpm-lock.yaml` (\*:lockfile-fresh), `Cargo.lock` (clippy `--locked`).
Language specifics (rustfmt/clippy config, sqlx macros, eslint/prettier per
package) live in the subtree `AGENTS.md` files. Follow existing patterns in
the surrounding code.

## 6. GS-RFCs

Every non-trivial change adds or updates a GS-RFC in
[`.agents/gs-rfcs/`](.agents/gs-rfcs/README.md) in the same batch — grep the
tree for the topic first; only mechanical/local edits are exempt. GS-RFCs are
bilingual decision records (proposal → review → implement); the
`writing-gs-rfcs` skill owns the workflow.

## 7. Documentation

The corpus is bilingual: every non-exempt document pairs `foo.md` with an
equal-authority `foo.zh.md`, updating together. [`specs/AGENTS.md`](specs/AGENTS.md)
owns the standard (one fact one home, current-state prose, machine-checkable
links, word budgets); `scripts/doc_sync.py` runs the gates on commit and in
CI. A failing gate is fixed in the document, not the gate. Placement
decisions use the `doc-standards` skill.

## 8. Git Workflow

- **Do not commit or push on the agent's own initiative.** When your work is
  done and lint-clean, stop and tell the user to review and commit.
- Conventional Commits: `feat(server): ...`, `fix(web): ...`, `docs: ...`.
  The `commit-msg` hook rejects anything else.
- Commits land on `main` directly by project convention. prek installs
  `pre-commit` (format+lint+check), `pre-push` (tests+builds), `commit-msg`.

## 9. Boundaries

**✅ Always do:** run `python3 scripts/migrate.py prepare` after touching
`server/migrations/`, `server/src/db/`, or `server/Cargo.toml`; let prek do
the formatting; keep ESLint and clippy clean (`-D warnings`).

**⚠️ Ask first:** changing a public API shape (request/response JSON, CLI
flags); large multi-file refactors; new dependencies.

**🚫 Never do:** `git push` or any remote operation; edit generated files by
hand (`server/.sqlx/`, lockfiles); edit the packaged skills under `skills/`
and `*/skills/grilling-sleek/`; edit `CLAUDE.md` or mirrored skills directly
(run `scripts/sync_agents.py`); commit secrets or `.env`; run destructive
commands (`rm -rf`, `DROP TABLE`, force-push).

## 10. Agent Configuration

`.claude/`, `.codex/`, `.zcode/`, `.opencode/`, `.agents/` hold agent-tool
configuration, not project source. Their hooks are thin adapters over prek:
PostToolUse runs `prek run --group format --files <edited>`, Stop runs
`prek run --group lint --all-files` — no formatter/lint logic lives in them.
`AGENTS.md` ⇄ `CLAUDE.md` pairs are direction-free byte-identical mirrors;
the mirrored skill set is derived from `.claude/skills/` minus the packaged
`grilling-sleek` skill. Only edit these when the user explicitly asks for an
agent-behavior change.

## 11. Build & Deploy

Ship the current work end-to-end (gate → commit → build & push → deploy →
report): use the `shipping` skill. Deploys default to staging (rolling `main`
tag from the LAN registry). Version tags are pushed by CI on `v*` to Docker
Hub; production deploys a pinned version tag, which needs a release first
(`release` skill). Post-deploy, the health check compares `/v1/healthz`
`version` against `server/Cargo.toml`.
