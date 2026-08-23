# GS-RFC: The agent harness mechanism — GS-RFCs, layered agent instructions, documentation gates, and a bilingual corpus

Status: implemented

English | [中文](2026-08-22-agent-harness-mechanism.zh.md)

## Problem

This repository runs on AI-agent labor with no durable decision memory and no mechanical documentation checks. Root `AGENTS.md` was a single 1,448-word file covering three toolchains plus build and deploy, so every session loaded staging topology to edit a CLI typo — and its structure map had already drifted: `specs/`, `tests/`, and `skills/` existed on disk but were unlisted. `CLAUDE.md` was a directional copy that would silently clobber a fresher edit, and the mirror enforcement had a live hole: `scripts/check_agents.py` verified four mirrored skills while `scripts/sync_agents.py` synced five, so `.zcode/skills/iterating` could drift undetected. Decision rationale — why prek is the only gate, why builds are offline, why production is Cloudflare-only — lived nowhere but git history, so a well-meaning agent could reverse a deliberate tradeoff and nothing would remember why it was made. The documentation corpus was mixed-language (Chinese-native `specs/`, English `AGENTS.md`/`PRINCIPLES.md`, underscore-named `README_zh.md`) and nothing checked links, pair completeness, or budgets. The markpost project had adapted the deepseek-harness mechanism for this same class of problems; its decision history (`.agents/mrfcs/` there) was the evidence base — porting pieces on trigger signals, never wholesale.

## Decision

The mechanism is adopted in one batch, shaped by this repo's conventions: prek stays the single gate source, scripts stay stdlib-Python, and the agent-tool adapters stay thin. Six parts.

### 1. GS-RFCs — decision records under `.agents/gs-rfcs/`

Every GS-RFC lives at `.agents/gs-rfcs/{lifecycle}/yyyy-mm-dd-topic-title.md` plus a `.zh.md` twin. The date is when the topic was first proposed (per git history). The lifecycle tree is the inventory — there is no index file to maintain.

- **`proposed/`** — proposals reviewed before implementation. Not yet built, or only partly built.
- **`implemented/`** — the decision shipped, recorded in the present tense. When code later renames things, the record's facts update in the same change — but never edit it into a different decision; supersede it with a new GS-RFC and cross-link both.
- **`rejected/`** — the proposal was considered and declined. Keep one only while its rationale prevents a tempting mistake; otherwise delete it.

The header block is exactly `# GS-RFC: <title>` followed by a `Status:` line that agrees with the folder (`proposed`, `implemented`, or `rejected — <why, in one line>`). The body opens with `## Problem`, written to stand without the solution; `proposed/` continues Proposal / Alternatives considered / Acceptance criteria / Risks; `implemented/` continues Decision / Alternatives considered / Consequences; `rejected/` keeps its proposal-time sections frozen. `## Alternatives considered` is mandatory — one bold-led paragraph per genuine alternative and why it lost. Cross-references use relative Markdown links, never bare prose. The full contract lives in [the tree README](../README.md) with at most three standing orders in [its AGENTS.md](../AGENTS.md); [verify_gs_rfc_format](../../../scripts/verify_gs_rfc_format.py) enforces it.

Every non-trivial change adds or updates at least one GS-RFC in the same batch. A change is non-trivial when it alters behavior, architecture, a contract shared across files, tooling, testing strategy, or an on-disk or wire format. Purely mechanical or local edits are exempt; updating the record that already owns the decision satisfies the rule — grep `.agents/gs-rfcs/` for the topic first. Root `AGENTS.md` carries this rule in its GS-RFCs section, and the `writing-gs-rfcs` skill owns the workflow.

### 2. Layered agent instructions and direction-free mirrors

Root `AGENTS.md` keeps only standing orders — overview, repo map, git workflow, boundaries, and pointers — within a word budget; each component tree carries its own file with the commands and style that tree needs. A subtree file supplements the root and never repeats it. Ceilings live in [doc_budgets.manifest.json](../../../scripts/doc_budgets.manifest.json), gated by [verify_doc_budgets](../../../scripts/verify_doc_budgets.py) under a relocate → condense → raise-last policy:

| File | Ceiling (words) |
| --- | --- |
| `AGENTS.md` (root) | 900 |
| `server/AGENTS.md` | 450 |
| `web/AGENTS.md` | 250 |
| `cli/AGENTS.md` | 250 |
| `e2e/AGENTS.md` | 150 |
| `specs/AGENTS.md` | 600 |

Every `AGENTS.md` has a byte-identical `CLAUDE.md` beside it. A mirror pair has no primary: direction resolves per pair against git HEAD — never mtime, which clone and checkout reset. One side changed → the tooling syncs it over and stages the fix; both sides changed → conflict, and the check refuses to guess, naming the sides, the fix command, and the manual steps. `.zh.md` twins are documentation pairs (part 4), not mirror pairs — tool load paths read the English file. [check_agents](../../../scripts/check_agents.py) and [sync_agents](../../../scripts/sync_agents.py) keep their names, share helpers in [agentlib](../../../scripts/agentlib.py), and derive the mirrored-skill set from `.claude/skills/` minus the packaged `grilling-sleek` skill — never hardcoded, which closes the check/sync list mismatch found in Problem. Two skills joined the mirror set: `writing-gs-rfcs` and `doc-standards`.

### 3. The documentation standard — `specs/AGENTS.md`

[specs/AGENTS.md](../../../specs/AGENTS.md) owns the standard for the whole corpus: a tier table assigning each fact a single home plus the writing rules — current-state prose, machine-checkable relative links, word budgets, and bilingual pairs. Every rule names the gate that enforces it. [specs/index.md](../../../specs/index.md) lists every spec document (rust-guidelines flagged vendored) and [verify_specs_index](../../../scripts/verify_specs_index.py) checks both directions. `specs/rust-guidelines.md` is vendored material under a foreign copyright and is exempt from all documentation gates by manifest.

### 4. A fully bilingual corpus

Every documentation file is an equal-authority pair: `foo.md` and `foo.zh.md` in the same directory, updating together; neither language wins by default. Structure mirrors exactly — identical heading-depth sequences, byte-identical fenced code blocks (examples are not translated), level-2 headings and machine tokens in English on the Chinese side — with a language-switcher line near the top. Typography: half-width spaces between CJK and Latin, full-width Chinese punctuation. Scope is the whole corpus, no second-class files: all GS-RFCs, every `AGENTS.md` layer, `PRINCIPLES.md`, `specs/` (the three Chinese-native specs renamed to `.zh.md` with English twins written), `README.md` (`README_zh.md` became `README.zh.md`), `cli/README.md`, `web/DESIGN.md`, and `e2e/MANUAL.md` (itself Chinese-native, so it renamed to `.zh.md` and gained an English twin). Exemptions live in [doc_languages.manifest.json](../../../scripts/doc_languages.manifest.json): `CHANGELOG.md` (append-only ledger), `specs/rust-guidelines.md` (vendored), `skills/` (packaged release artifact), agent-tool config dirs (`.zcode/`, `.claude/`, `.codex/`, `.opencode/`, `.agents/skills/`), and `tests/load/` (operational load-test reports). [verify_doc_pairs](../../../scripts/verify_doc_pairs.py) gates completeness, switchers, structure, and language purity.

### 5. Documentation gates through prek

[doc_sync](../../../scripts/doc_sync.py) (stdlib Python, like every script here) runs six gates in sequence, each independently runnable and scoped to given file arguments — no arguments means the full git-respecting corpus: [verify_md_links](../../../scripts/verify_md_links.py) (relative links and heading anchors resolve), [verify_doc_current](../../../scripts/verify_doc_current.py) (current-state prose in README/specs/reference pages), [verify_gs_rfc_format](../../../scripts/verify_gs_rfc_format.py), [verify_doc_budgets](../../../scripts/verify_doc_budgets.py) (a budgeted file gone missing fails so renames cannot orphan budgets), [verify_doc_pairs](../../../scripts/verify_doc_pairs.py), and [verify_specs_index](../../../scripts/verify_specs_index.py), sharing helpers in [doclib](../../../scripts/doclib.py). Gate failures name the fix, and a failing gate is fixed in the document, not the gate. The proposal promised five gates; the current-state rule arrived with its enforcing gate in the same batch — a rule without its gate would violate the standard it introduced.

The prek `doc-check` hook (check group, pre-commit stage) runs `doc_sync` over the full corpus in one pass — the pair and index gates need the whole tree, and the hook runner may batch filenames; the `agents-sync` hook covers the subtree `AGENTS.md`/`CLAUDE.md` pairs. Nothing was added to CI: the existing gate job already runs `prek run --all-files`, so local green stays CI green — a divergence from markpost, whose separate docs workflow exists only because its CI lint lane path-ignores `*.md`; ours does not.

Declined for now, each with its revival trigger: a gate scheduler (trigger: the suite grows past ten gates or needs cross-gate dependencies); per-pair hash sidecars (trigger: recurring merge conflicts on pairs); a co-change diff gate for pairs (trigger: pairs repeatedly landing solo); the reference's one-line-per-paragraph wrap gate (trigger: prettier stops owning Markdown formatting here — it already does, so a second referee would fight it); a translation skill (trigger: consistency complaints across Chinese twins); GS-RFC classification subfolders and a frozen archive (trigger: the tree grows past roughly a hundred records).

### 6. Backfill and self-binding

Three historical decisions — the ones an agent is most likely to reverse without a record — are backfilled as implemented GS-RFCs, dated by their introducing commits: [sqlx offline deterministic builds](./2026-07-17-sqlx-offline-deterministic-builds.md) (`75f5908`), [prek as the single source of gating](./2026-08-15-prek-single-source-of-gating.md) (`935c496`), and [the production Cloudflare-only origin](./2026-08-15-production-cloudflare-only-origin.md) (`0defc11`). This record follows the rule it introduces: it started in `proposed/`, was reviewed, and flipped to `implemented/` — `## Proposal` rewritten into present-tense `## Decision`, criteria and risks folded into `## Consequences` — in the batch that landed the mechanism.

`PRINCIPLES.md` stays a live document with its own pair — unlike markpost, which freezes its predecessor, because here it is the operational form the `iterating` skill loads every session; no migration signal has arrived. The in-flight load-test work (uncommitted changes under `server/`, `tests/load/`, `docker/`, `.github/workflows/load-test.yml`) is untouched by the batch: the file sets are disjoint, the gates see git-respecting files only, and `tests/load/` is exempt from pairing.

## Alternatives considered

**Port the reference repo's machinery wholesale.** deepseek-harness runs a dependency-graph gate scheduler, RFC class folders with a frozen append-only archive, `.md` + `.zh.md` + `.i18n.yaml` triplets with blob-hash freshness records, symlinked instruction mirrors, per-lifecycle AGENTS files, and coverage manifests — roughly 5,300 lines of gate tooling for about 1,150 bilingual pairs. It lost: this corpus is two orders of magnitude smaller, scripts here are stdlib-Python by convention, and markpost's founding verdict already tested the wholesale path and rejected it — pieces port on trigger signals, never wholesale. That verdict is imported along with the mechanism.

**`docs/rfcs/` or ADR-style `docs/adr/` placement.** It lost: this corpus is agent-first in both authorship and readership, `.agents/` is the load path agent tools already converge on, and the ADR frame describes only decided things — GS-RFCs include proposals under review and rejected verdicts.

**Symlink `CLAUDE.md` mirrors — the reference mechanism.** Zero drift by construction. It lost: git stores a symlink as a mode-120000 blob, and a Windows checkout without `core.symlinks=true` materializes `CLAUDE.md` as a regular file containing nine bytes of text — the first Windows clone trades drift risk for a broken mirror. Real-file, direction-free pairs keep the guarantee on every platform.

**Keep directional AGENTS → CLAUDE sync.** It lost: directionality is the defect, not a tuning choice — a tool that loads `CLAUDE.md` and edits it gets its edit silently clobbered by the next sync. The live check/sync skill-list mismatch is the same disease in a second organ: hardcoded parallel lists drift. Direction-free resolution plus dynamic derivation fixes both roots.

**Bilingual GS-RFCs only, defer the rest.** It lost: a two-class corpus whose Chinese side permanently loses the decision history of everything predating the mechanism — and the maintainer's stronger language is Chinese while `specs/` was already Chinese-native, so equal authority describes reality rather than imposing a primary. The existing corpus is small enough (about 4–5k words of instructions and specs, plus the design and manual pages) to normalize in one batch, unlike the reference's scale.

**A separate CI documentation workflow (markpost's shape).** It lost: markpost's `docs.yml` exists because its lint lane path-ignores `*.md`; this repo's CI gate job runs `prek run --all-files` unconditionally. A second workflow would reintroduce the parallel gate definition prek exists to eliminate — the exact regression the single-source principle forbids.

**The wrap gate.** It lost: prettier already owns Markdown formatting for the root and `specs/` tiers here; one paragraph-per-line is a second referee fighting the first. Revival trigger recorded in Decision §5.

**An index file for GS-RFCs.** It lost: the lifecycle tree is the inventory, and an index is a second list to keep honest. (A `specs/index.md` is different: specs are flat documents without lifecycle folders, and the index is the entry point the tree cannot provide.)

**Backfill nothing, or backfill five.** Backfilling nothing lost: the three chosen conventions are counterintuitive by design — an offline build cache that must never touch a DB, a single gate source that forbids CI-local checks, a production origin that rejects direct traffic — precisely the tradeoffs a competent agent "fixes" first. Backfilling five (adding the round-revision flow and the e2e real-stack strategy) lost: those two already carry their rationale in code and `PRINCIPLES.md` (minimal mock, maximal real), so records would duplicate an existing home — the tier table's first rule.

**Freeze `PRINCIPLES.md` and migrate its rules into `AGENTS.md` conventions (markpost's direction).** It lost: here `PRINCIPLES.md` is loaded as the operational form by the `iterating` skill each session and is referenced from root `AGENTS.md`; freezing it would break that chain for zero measured gain.

## Consequences

Documentation regressions now fail at commit and in CI mechanically, decision rationale has a home, and the instruction files are bounded, mirrored, and direction-free. The whole mechanism is Python-stdlib with zero new dependencies. The rule binds its own introduction — this record is the process change it governs, flipped to implemented in the landing batch, and the batch itself was verified against its acceptance list: `prek run --all-files` green with the new `doc-check` and widened `agents-sync` hooks; every rule in `specs/AGENTS.md` naming its enforcing gate; the corpus fully paired per manifest with `README_zh.md` gone; the three backfills passing the format gate with dates matching their commits; every `AGENTS.md` within its ceiling and byte-identical to its `CLAUDE.md`; the skill set derived from the directory with `grilling-sleek` untouched; `specs/index.md` agreeing with the tree both directions; and the in-flight load-test files showing zero diff.

The costs it accepts: every non-trivial change carries a new or updated GS-RFC, and every documentation edit touches a pair — the translation tax is permanent and was chosen deliberately, with the structure-parity gate keeping twins mechanically honest. Root condensation moved server/web/cli operational detail into subtrees; an agent that reads only the root misses tree orders, mitigated by pointer discipline and by tools that load subtree instruction files as they read files there. The non-trivial-change rule is only socially enforced for existence — nothing mechanical detects a missing record; root `AGENTS.md`, the `writing-gs-rfcs` skill, and review carry it. Gate false positives near the edge are fixed in the document, not the gate; when a genuine need changes a gate, the gate change ships in the same batch as the need that motivated it and says so here. And a failing gate is fixed in the doc rather than the gate — unless the gate is wrong, in which case the previous sentence applies.
