---
name: doc-standards
description: Use when writing, moving, reviewing, or auditing documentation in grill-me-sleek — deciding where a fact lives (README/specs/GS-RFCs/skills), adding a spec to specs/index.md, trimming history narration from current-state docs, responding to a doc_sync.py gate failure, or requests like "improve the docs", "where should this be documented", "this doc is too long".
argument-hint: "Documentation question or gate failure"
---

# Applying the grill-me-sleek documentation standard

The rules live in [specs/AGENTS.md](../../../specs/AGENTS.md). This workflow covers placement, writing discipline, and validation. Guidance, not a script.

## Placement: one fact, one home

Before writing, check [specs/index.md](../../../specs/index.md) for an existing home; grep a distinctive phrase to catch duplicates. New content goes to the tier whose job it is; everywhere else links there. The full tier table lives in the standard; the short version:

| Tier | Job |
| --- | --- |
| `README.md` / `cli/README.md` | User-facing product docs |
| Root `AGENTS.md` | Standing orders for every session |
| Subtree `AGENTS.md` (`server/`, `web/`, `cli/`, `e2e/`, `specs/`) | Orders for that tree; never repeat the root |
| `PRINCIPLES.md` | Behavioral constraints for the agent |
| `specs/` | Current-state design reference; `specs/index.md` is the authoritative index |
| `.agents/gs-rfcs/` | Proposals and decision records ([README](../../../.agents/gs-rfcs/README.md)) |
| `CHANGELOG.md` | Ledger — narrates history by design, gated nowhere |
| `.claude/skills/` | Reusable workflows (then run `scripts/sync_agents.py`) |

Rationale and change stories go to `.agents/gs-rfcs/`, never into `specs/` prose.

## Writing discipline

- **Current state only** in README, specs, and reference pages: no "previously/now/no longer/此前/不再". Name the live mechanism; link the owning GS-RFC for the why. `verify_doc_current.py` gates this.
- **Relative Markdown links with real targets and `#fragment` anchors**; never bare filenames or free prose references. `verify_md_links.py` gates this.
- **Bilingual pairs**: every non-exempt document pairs `foo.md` with `foo.zh.md`, equal authority — write or edit either side first, bring the twin along in the same change with a minimal patch, never a wholesale re-translation. Headings depth-sequence mirrors, fenced code blocks are byte-identical, level-2 headings and machine tokens stay English on the Chinese side, no Chinese prose on the English side. `verify_doc_pairs.py` gates this; exemptions live in `scripts/doc_languages.manifest.json`.
- **Word ceilings** bound the agent-instruction files (`scripts/doc_budgets.manifest.json`, gated by `verify_doc_budgets.py`); on red, relocate, condense, raise the ceiling last with a justified manifest diff.
- **New spec file ⇒ new row in `specs/index.md` and its zh twin in the same change.** `verify_specs_index.py` gates this.
- Deleting or renaming a doc is atomic: move the content (both languages), fix every inbound link, update the index — one change.

## Validate

From the repo root: `python3 scripts/doc_sync.py` (all gates over the full corpus; add file paths to restrict). It also runs as the prek `doc-check` hook on commit and in CI via `prek run --all-files`. When a gate fails: fix the doc, not the gate; if the gate itself is wrong, change it in the same change and say why in the owning GS-RFC.
