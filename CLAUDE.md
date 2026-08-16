# AGENTS.md

> This file gives AI coding agents (Claude Code, Codex, ZCode, OpenCode, etc.)
> the operating rules for this repository. It is intentionally short, concrete,
> and command-first. The same content lives in `CLAUDE.md` (kept in sync by
> `scripts/sync_agents.py`, enforced by the prek `agents-sync` hook).

Design and behavior principles — ground conclusions in fact, fix root causes,
single source of truth, graceful degradation, etc. — live in
[`PRINCIPLES.md`](PRINCIPLES.md). Reach for them when making design or
convention decisions.

## 1. Project Overview

**grill-me-sleek** stress-tests a plan before vibe coding: the agent asks
questions, you answer them in a sleek web UI. Three components, one repo:

| Component | Path       | Role                                                                   |
| --------- | ---------- | ---------------------------------------------------------------------- |
| `server/` | Rust       | The "Hub" — REST API + SSE, SQLite-backed (axum + sqlx)                |
| `web/`    | TypeScript | React SPA served to the user for reviewing questions                   |
| `cli/`    | TypeScript | Published to npm as `@grilling-sleek/cli`; bridges an agent to the Hub |

## 2. Tech Stack (exact versions)

- **Server**: Rust **edition 2024**, MSRV **1.85**, `axum 0.8`, `sqlx 0.9`
  (sqlite, with `migrate` + `sqlite-bundled` features), `tokio 1`.
- **Web**: React **19**, Vite **8**, TypeScript **5.9**, Tailwind **4.3**,
  ESLint **9** (flat config), Vitest **3.2**, Prettier **3**.
- **CLI**: TypeScript **5.9**, esbuild **0.25**, ESLint **9**, Prettier **3**.
- **E2E**: Playwright **1.61**.
- **Quality gate**: **prek** (drop-in pre-commit rewrite). Version 0.4+ with
  workspace + group support.
- **Package manager**: **pnpm 11** (each of web/cli/e2e has its own
  `pnpm-lock.yaml`; there is no workspace root install).

## 3. Commands

**prek is the single source of truth for all quality gating.** Every
format/lint/check lives in `prek.toml` (root) + `server|web|cli/prek.toml`.
CI runs the exact same hooks (`prek run --all-files`), so local green ==
CI green. Hook groups:

- `format` — mutating fixers, auto-fix by default (cargo fmt, prettier,
  builtin fixers)
- `lint` — read-only gates (clippy `--locked`, eslint, `tsc --noEmit`)
- `check` — read-only validation (builtin checks, actionlint, `.sqlx`
  freshness, lockfile freshness, agents-sync)

```
# prek (run from repo root)
prek install                                       # one-time: install git hooks
prek run --all-files                               # everything (== CI gate)
prek run --group format --files <path>             # format specific files
prek run --group lint --all-files                  # lint gate (== AI Stop hook)

# Server (Rust) — cd server
cargo test                                         # unit + integration tests
cargo run                                          # dev server (127.0.0.1:8000)

# Web — cd web / CLI — cd cli
pnpm test                                          # vitest run
pnpm build                                         # web: tsc && vite build; cli: esbuild
pnpm dev                                           # web dev server (5173 → :8000)

# Database migrations (run from repo root)
python3 scripts/migrate.py prepare   # regenerate server/.sqlx/ cache (fix for server:sqlx-check)
python3 scripts/migrate.py check     # verify .sqlx is up to date (what prek/CI run)
python3 scripts/migrate.py add NAME  # create new migration file

# Docker (run from repo root)
python3 docker/build.py                        # build main tag for local host platform
python3 docker/build.py --push                 # push main to 192.168.5.50:5000 (staging deploys this)
python3 docker/build.py --push --all-platforms # multi-arch (amd64+arm64) push

# Deploy (run from repo root; ansible.cfg supplies inventory + avpm vault ids)
ansible-playbook devops/ansible/deploy.yml                     # staging (fn), default
ansible-playbook devops/ansible/deploy.yml -e target=production  # production (ttyo, pinned tag)
```

## 4. Project Structure

```
prek.toml        Workspace-root prek config: builtin checks/fixers, root
                 prettier, actionlint, agents-sync, commit-msg gate.
server/prek.toml Rust hooks (cargo fmt / clippy --locked / sqlx-check / test).
web/prek.toml    Web hooks (prettier / eslint / tsc / lockfile / test+build).
cli/prek.toml    CLI hooks (prettier / eslint / tsc / lockfile / test+build).

server/          Rust service. WRITE HERE for API/DB work.
  src/db/        SQL access (sqlx query! macros). Touch → run migrate prepare.
  migrations/    SQL migration files (timestamped). Touch → run migrate prepare.
  .sqlx/         GENERATED offline cache. Never hand-edit (see §8).

web/             React SPA. WRITE HERE for UI work.
cli/             CLI tool. WRITE HERE for CLI work.
e2e/             Playwright E2E tests (runs against docker-compose.local).

docker/          Dockerfile + compose configs + build.py (Caddy → :8000).
devops/ansible/  Unified deploy.yml + group_vars/{staging,production} + templates.
ansible.cfg      At repo root: inventory + avpm vault_identity_list.
scripts/         Repo tooling, Python stdlib only (see file headers for the
                 prek hook each script serves).

.claude/ .codex/ .zcode/ .opencode/ .agents/    Agent-tool config, not source (§9).
```

## 5. Code Style

**prek defines every formatter/linter invocation** — there is no parallel
definition in CI or elsewhere:

- **Rust** (`server/`): `cargo fmt`; `cargo clippy --all-targets --locked --
-D warnings` (warnings are errors; `--locked` also gates Cargo.lock
  freshness). Config: `server/rustfmt.toml`, `server/clippy.toml` (msrv 1.85).
  SQL uses sqlx compile-time macros (`query!` / `query_as!`); never raw
  strings.
- **TypeScript** (`web/`, `cli/`): ESLint 9 flat config per package; Prettier 3
  (root `.prettierrc.json`; `web/.prettierrc.json` adds the tailwind plugin).
  Root-level `*.md`/`*.yml`/`*.json` files are formatted by the `prettier-root`
  hook.
- **Generated files** are exempt from fixers (the generator owns those bytes)
  and validated for freshness instead: `server/.sqlx/` (server:sqlx-check),
  `pnpm-lock.yaml` (\*:lockfile-fresh), `Cargo.lock` (clippy `--locked`).
- CI's gate job just installs the toolchains and runs `prek run --all-files`.

## 6. Database Workflow

sqlx validates SQL at **compile time** against a checked-in offline cache.

- **Default**: `SQLX_OFFLINE=true` (see `server/.env.example`). `cargo build`
  uses `server/.sqlx/` and never connects to a DB — deterministic builds.
- **When you change a migration, a `query!` macro, or the sqlx version**: run
  `python3 scripts/migrate.py prepare` from the repo root. This builds a
  throwaway SQLite DB from `migrations/`, regenerates `.sqlx/`, and cleans up.
- The prek `server:sqlx-check` hook (and CI via the same hook) fails the
  commit if the cache is stale.

## 7. Git Workflow

- **Do not commit or push on the agent's own initiative.** When your work is
  done and lint-clean, stop and tell the user to review and commit.
- The project follows [Conventional Commits](https://www.conventionalcommits.org/):
  `feat(server): ...`, `fix(web): ...`, `refactor(cli): ...`, `docs: ...`,
  `chore: ...`. The `commit-msg` hook (`scripts/check_commit_msg.py`) rejects
  anything else.
- Commits land on `main` directly by project convention (no PR required for
  routine work). Branch protection is NOT enforced via pre-commit.
- prek installs three hooks: `pre-commit` (format+lint+check),
  `pre-push` (tests + builds, mirroring the CI test/build jobs), and
  `commit-msg` (Conventional Commits).

## 8. Boundaries

**✅ Always do:**

- Run `python3 scripts/migrate.py prepare` after touching `server/migrations/`,
  `server/src/db/`, or `server/Cargo.toml`.
- Let prek do the formatting (`prek run --group format --files <path>`);
  never invent formatter incantations.
- Keep ESLint and clippy clean (`-D warnings`).
- Follow existing patterns in the surrounding code.

**⚠️ Ask first:**

- Changing a public API shape (request/response JSON, CLI flags).
- Large refactors that touch many files at once.
- Adding new dependencies.

**🚫 Never do:**

- `git push`, `git push --tags`, or any remote operation.
- Edit generated files by hand: `server/.sqlx/` (regenerate via
  `migrate.py prepare`) and lock files (`pnpm-lock.yaml` via
  `pnpm install`, `Cargo.lock` via `cargo update`/build).
- Commit secrets, private keys, or `.env` files.
- Modify `.claude/skills/grilling-sleek/`, `.agents/skills/grilling-sleek/`, or
  `.zcode/skills/grilling-sleek/` — these are packaged skill artifacts.
- Run destructive commands (`rm -rf`, `DROP TABLE`, force-push).

## 9. Agent Configuration Note

The directories `.claude/`, `.codex/`, `.zcode/`, `.opencode/`, and `.agents/`
hold **agent-tool configuration, not project source**:

- `*/settings.json`, `*/hooks.json` — hook registrations.
- `.claude/hooks/`, `.codex/hooks/`, `.zcode/hooks/` — hook scripts.
- `.opencode/plugins/hooks.ts` — OpenCode plugin.
- `*/skills/` — skill definitions.

Their hooks are **thin adapters over prek**: PostToolUse runs
`prek run --group format --files <edited>`, Stop runs
`prek run --group lint --all-files`. No formatter/lint logic lives in them, so
they cannot drift from prek/CI. Only edit them when the user explicitly asks
for a change to agent behavior. The packaged skills under `*/skills/grilling-sleek/`
in particular are release artifacts — never edit them in place unless
explicitly instructed. `AGENTS.md` == `CLAUDE.md` and the mirrored skills
(`commit`, `shipping`, `playwright-cli`, `release`, `iterating`) are kept
identical by `scripts/sync_agents.py` / enforced by the prek `agents-sync` hook.

## 10. Build & Deploy

Ship the current work end-to-end (gate → commit → build & push → deploy →
report): use the `shipping` skill. Deploys default to staging; production
deploys a pinned version tag, which needs a release first (release skill).

- **`main` tag**: rolling, built from the current workspace by
  `python3 docker/build.py --push` → private registry `192.168.5.50:5000`.
  Never published to Docker Hub (CI cannot reach the LAN registry). Default
  platform is the host platform; `--all-platforms` for amd64+arm64 (buildx).
- **Version tags**: pushed by CI (`docker-publish.yml`) on `v*` git tags to
  Docker Hub `jukanntenn/grilling-sleek`, native per-arch runners + manifest
  merge. `vX.Y.Z` → `X.Y.Z` + `latest`; `vX.Y.Z-rc.N` → `X.Y.Z-rc.N` only
  (`latest` always points at the newest **stable** release).
- **staging (fn @ 192.168.5.200)**: deploys the rolling `main` tag over LAN
  HTTP; post-deploy health check compares `/v1/healthz` `version` against
  `server/Cargo.toml`.
- **production (ttyo @ 43.133.160.29)**: Cloudflare-only origin (Origin CA
  cert + CIDR allowlist in the Caddyfile), pinned Docker Hub version tag
  (`group_vars/production/vars.yml`), same health check. Secrets use
  per-variable `!vault` encryption with avpm vault-ids
  (`grilling-sleek-staging` / `grilling-sleek-prod`).
