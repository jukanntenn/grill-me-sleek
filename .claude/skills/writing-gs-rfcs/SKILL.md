---
name: writing-gs-rfcs
description: Use when a non-trivial change lands in grill-me-sleek (new capability, schema or contract change, architectural shift, tooling/process change) and needs a GS-RFC, when searching .agents/gs-rfcs/ for prior decisions on a topic, when superseding or rejecting an existing record, or when asked "why is X like this" / "record this decision".
argument-hint: "Topic or decision to record"
---

# Writing GS-RFCs

GS-RFCs are grill-me-sleek's RFCs: durable proposals and decision records — the why, the alternatives that lost, and what the trade-off bought. The full contract — naming, lifecycle, format skeleton — lives in [.agents/gs-rfcs/README.md](../../../.agents/gs-rfcs/README.md); `scripts/verify_gs_rfc_format.py` enforces it.

## Before writing

1. `grep -ri "<topic keywords>" .agents/gs-rfcs/` — the decision may already have a home. Updating the owning record in the same batch satisfies the rule; never create a duplicate.
2. If a new decision supersedes an old one: write the new record, cross-link both (old → new with a one-line pointer, new → old in Alternatives), and keep the old file unless fully consolidated.
3. Pick the lifecycle: `proposed/` for anything not yet built (substantial future work is written down *before* implementation), `implemented/` for decisions that shipped, `rejected/` for declines worth remembering.

## Writing it

- Filename: `yyyy-mm-dd-topic-title.md` — the date the topic was first proposed (per git history), a lowercase slug. Every record is a bilingual pair: write the `foo.md` and `foo.zh.md` sides together, machine tokens and level-2 headings in English ([documentation standard](../../../specs/AGENTS.md)).
- `## Problem` must stand without the solution: what forced the decision?
- `implemented/` states `## Decision` in present tense describing shipped reality — paths and names must match the code today. Proposal-era headings (`## Proposal`, `## Plan`, `## Acceptance criteria`) are rejected there.
- `## Alternatives considered` is mandatory: one bold-led paragraph per genuine alternative and why it lost. Record the alternatives as they were actually argued; never invent them.
- `## Consequences` records what the trade-off cost *and* bought.
- Keep facts current: when code moves what an implemented record references, update the record's facts in the same change.

## Lifecycle moves

Moving a file between folders re-satisfies the target folder's skeleton in the same change, moving both languages of the pair: `proposed/ → implemented/` rewrites Proposal into a present-tense Decision and folds Acceptance criteria/Risks into Consequences; `proposed/ → rejected/` adds the one-line reason to `Status:` and freezes the file. The format gate fails the move otherwise.

Validate with `python3 scripts/doc_sync.py .agents/gs-rfcs/<path>` before handing off; the prek `doc-check` hook runs it on commit.
