# GS-RFC: prek is the single source of gating

Status: implemented

English | [中文](2026-08-15-prek-single-source-of-gating.zh.md)

## Problem

Quality gates were accreting in parallel: a pre-commit config, per-tool hook scripts in four agent directories (`.claude`, `.codex`, `.zcode`, `.opencode`), and CI definitions could each name their own formatter and linter invocations. Every parallel definition is a drift surface — local green stops implying CI green the moment two of them disagree (consolidated in `935c496`, 2026-08-15).

## Decision

One tool owns every gate: prek. Workspace configs at the root plus `server/`, `web/`, and `cli/` define three groups — `format` (mutating fixers), `lint` (read-only quality gates), `check` (read-only validation) — and every formatter, linter, and freshness check lives in exactly one of them. `prek run --all-files` is the whole CI gate job; the agent-tool hooks are thin adapters that delegate to the same groups (PostToolUse runs `format` on edited files, Stop runs `lint`), so no formatter or lint logic lives outside prek and nothing can drift from CI. The `commit-msg` hook enforces Conventional Commits via `scripts/check_commit_msg.py`; pre-push mirrors the CI test/build jobs. The documentation gates introduced by [the agent-harness record](./2026-08-22-agent-harness-mechanism.md) follow the same rule: they run as the prek `doc-check` hook, with no separate CI workflow.

## Alternatives considered

**Keep pre-commit with per-tool hook scripts.** It lost: four agent tools each carrying hook logic is four places to drift; prek's workspace and group support made the consolidation a single config family instead of a convention to remember.

**A Make/just task runner as the entry point.** It lost: a second runner over the same commands reintroduces the parallel definition being eliminated — the Makefile becomes the truth and prek its mirror.

**Enforce in CI only.** It lost: agents need local gates they can run after every edit (the PostToolUse/Stop hooks); CI-only enforcement moves every formatting discovery to the slowest feedback loop.

## Consequences

Local green is CI green by construction, and adding a check means adding one prek hook — there is no second place to put it. The costs: every contributor and CI runner needs prek installed; hook changes (like the documentation gates) land as edits to the shared configs, so they are repo-wide by nature; and `prek run --all-files` assumes the whole tree is gateable, which is why generated files are exempted by explicit regexes rather than by convention.
