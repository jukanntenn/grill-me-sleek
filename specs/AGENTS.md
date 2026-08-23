# AGENTS.md — specs/ (the documentation standard)

English | [中文](AGENTS.zh.md)

This file owns the standard for the whole documentation corpus. Every rule names the gate that enforces it; gates run via [`scripts/doc_sync.py`](../scripts/doc_sync.py) on commit (prek `doc-check`) and in CI (`prek run --all-files`). A failing gate is fixed in the document, not the gate.

## One fact, one home

| Fact                              | Home                                            | Does not belong                          |
| --------------------------------- | ----------------------------------------------- | ---------------------------------------- |
| Standing orders for every session | Root `AGENTS.md`                                | Tree detail, deploy runbooks             |
| Orders for one tree               | Subtree `AGENTS.md`                             | Repo-wide rules the root already carries |
| Behavioral principles             | `PRINCIPLES.md`                                 | Per-tree commands                        |
| Current-state design reference    | `specs/` (indexed by `index.md`)                | Decision rationale, change stories       |
| Operations runbooks               | `docs/`                                         | Design prose, agent orders               |
| Why a decision is what it is      | `.agents/gs-rfcs/`                              | Specs prose                              |
| User-facing product docs          | `README.md`, `cli/README.md`                    | Agent orders                             |
| Append-only history ledger        | `CHANGELOG.md` (gated nowhere, by design)       | Anything current-state                   |
| Reusable agent workflows          | `.claude/skills/` (mirrored, never hand-copied) | Prose documentation                      |

`web/DESIGN.md` and `e2e/MANUAL.md` are specs-tier references living beside their trees; they follow every rule here. `docs/` holds operations runbooks — how to run what `specs/` describes. It follows every rule here except `specs/index.md` indexing and word ceilings (budgets bound agent-instruction files).

## Rules

1. **Current-state prose.** README, specs, and reference pages describe what is — never "previously / no longer / `此前` / `不再`". Name the live mechanism and link the owning GS-RFC for the why. Gated by `verify_doc_current`.
2. **Machine-checkable links.** Relative Markdown links with real targets and real `#fragment` anchors; never bare filenames or prose references. Gated by `verify_md_links`.
3. **Bilingual pairs.** Every non-exempt document pairs `foo.md` with an equal-authority `foo.zh.md` in the same directory, updating together: identical heading-depth sequences, byte-identical fenced code blocks, level-2 headings and machine tokens in English on the Chinese side, a language-switcher line near the top, and no Chinese prose on the English side. Typography: half-width spaces between CJK and Latin, full-width Chinese punctuation (terminology seed lives in the [Chinese twin](AGENTS.zh.md)). Exemptions: `scripts/doc_languages.manifest.json`. Gated by `verify_doc_pairs`.
4. **Word budgets.** The agent-instruction files carry ceilings in `scripts/doc_budgets.manifest.json`; a budgeted file gone missing fails. On red: relocate to the owning tier, condense, raise the ceiling last with a justified manifest diff. Gated by `verify_doc_budgets`.
5. **Indexed specs.** A spec document appears or disappears together with its row in `specs/index.md`; the index links only to existing files. `rust-guidelines.md` is vendored, exempt from every gate, and still indexed. Gated by `verify_specs_index`.
6. **Decision records follow the GS-RFC contract** (naming, lifecycle skeletons, mandatory alternatives). Gated by `verify_gs_rfc_format`.

Deleting or renaming a document is atomic: move both languages, fix every inbound link, update the index and any owning record — one change.
