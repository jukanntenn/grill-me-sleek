# GS-RFC: a docs/ directory for operations runbooks

Status: proposed

English | [中文](2026-08-22-docs-directory-ops-runbooks.zh.md)

## Problem

Bringing production up spans two sides: the origin (automated by `devops/ansible/deploy.yml`) and the Cloudflare edge — console operations plus one manual handstep, because the Origin CA certificate must be copied onto ttyo and the playbook creates the directory but fetches nothing. The corpus has no home for the second kind of content: the tier table assigns current-state design reference to `specs/`, standing orders to `AGENTS.md`, decisions to `.agents/gs-rfcs/`, and the table explicitly rules deploy runbooks out of the root. The edge-side procedure exists nowhere in the repository.

## Proposal

Add a top-level `docs/` tier for operations runbooks — step-by-step procedures for humans operating production (deployment, certificate rotation, CIDR resync). Division of labor: `specs/` describes how the system is; `docs/` describes how to run it. The tier follows every rule of [the standard](../../../specs/AGENTS.md) except two: no `specs/index.md` row (it is not a spec) and no word ceiling (budgets bound agent-instruction files). First resident: `docs/deployment.md` (+ `.zh.md`), the Cloudflare bring-up runbook — zone onboarding, proxied A record, Full (strict), Origin CA issuance, certificate install on ttyo, deploy + verification, and the recurring maintenance items. The same change adds the tier-table row to `specs/AGENTS.md` (+ zh) and the structure-map line to the root `AGENTS.md` (+ zh; `CLAUDE.md` follows via `scripts/sync_agents.py`), and raises the root word ceiling 900 → 910: the file sat at 899 words, so no structure-map line for a new directory could fit, and the ceiling is the thing to move, not unrelated prose.

## Alternatives considered

**`specs/deployment.md`.** It lost: zero standard change and a gated index, but it would plant a numbered console procedure inside the design-reference tier — the runbook is a different genre, and the owner preferred an explicit operations tier over stretching `specs/`.

**`devops/DEPLOY.md` beside the playbook.** It lost: it follows the `web/DESIGN.md` / `e2e/MANUAL.md` tree-adjacent precedent, but the runbook's center of gravity is the Cloudflare console, which has no tree in this repository; a top-level tier matches the audience (humans operating production) rather than a tooling directory.

**Folding the steps into the root `AGENTS.md` deploy section.** It lost: the tier table already excludes deploy runbooks from standing orders, and the 900-word ceiling has no room for a procedure.

## Acceptance criteria

- `docs/deployment.md` and `docs/deployment.zh.md` exist and pass all six documentation gates.
- `specs/AGENTS.md` (+ zh) carries the `docs/` tier row with the division rule; the root `AGENTS.md` (+ zh, `CLAUDE.md` mirrored) lists `docs/` in the structure map.
- `python3 scripts/doc_sync.py` is green.

## Risks

A fourth home for reference-shaped content (README / `specs/` / `docs/` / tree-adjacent) can fragment discoverability; the division rule in the tier table and the structure-map line are the guardrails. `docs/` has no machine index like `specs/index.md`, so a runbook there is found by browsing or inbound links — acceptable while the tier holds one document.
