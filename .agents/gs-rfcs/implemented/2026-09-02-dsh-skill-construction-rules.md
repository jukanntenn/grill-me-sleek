# GS-RFC: dsh skill construction rules — pre-disclosing `grill_user`'s execute-time constraints in the skill body

Status: implemented

English | [中文](2026-09-02-dsh-skill-construction-rules.zh.md)

## Problem

Field use of the [dsh grilling plugin](2026-08-31-dsh-grilling-integration.md) shows a first-call rejection loop the official `ask_user_question` tool never exhibits: the model authors a `grill_user` batch that passes the visible parameter schema yet gets rejected inside `execute`, reads the error, revises, and resubmits — sometimes several times, because the errors surface one violated constraint at a time. The root cause is a contract-visibility gap, not a bug: the Harness's enforced JSON Schema subset accepts only structure (`type`/`required`/`properties`/`items`/scalar `enum`/`const`; unsupported keywords reject at registration), so the eleven value constraints `mapping.ts` checks — the `grill_` id grammar, batch-unique ids, the reserved catch-all id, two-or-more options, `recommended` in range, `multiSelect` only with options, positive `maxLength`, the branch and count floors — cannot appear anywhere in the schema the model sees every request. They exist only as description prose and execute-time rejections. The official tool never loops because its whole contract is structural and open-world (`additionalProperties: true`, two required fields per question, recommendation expressed as an unenforced label convention); `grill_user` layers a stricter closed schema plus a value layer the subset cannot carry, and every error lands exactly on that delta.

The schema itself is the wrong place to fix this: it is a public contract on an independent `0.0.x` line (an ask-first boundary in `dsh/AGENTS.md`) that will keep evolving, and contorting it to dodge model habits trades a living contract for a one-off error-rate win. What the model lacks is not a different schema but a pre-call view of the constraints the schema cannot carry — delivered before the first `grill_user` call, not through error feedback after it.

## Decision

The runtime skill body is that pre-call view. `GRILLING_SKILL_CONTENT` (`dsh/src/skill.ts`) carries an explicit **Construction rules** checklist enumerating every `toQuestions` value constraint in `mapping.ts` — one line per check, phrased as build-to instructions — placed after the interview discipline, before the answer-reading guidance. Loading the skill (model-matched or `/grilling-sleek`) now discloses the complete rejection surface in the same breath as the discipline that needs it; the tool description and parameter schema stay untouched.

The skill body was chosen over the tool description because the description rides every request and bills per token, while the rules are needed exactly once, at first construction; the body loads on demand and is retained as ordinary skill history.

Keeping the checklist in step with the checks is, today, a prose anchor: the module JSDoc of `skill.ts` names `mapping.ts` as the source of the rules, the module JSDoc of `mapping.ts` names the Construction rules as each check's counterpart and requires the line to move with the check in the same change, and one test asserts the section (with the reserved id) is present in the registered content, so the checklist cannot silently disappear. A future gate will enforce the sync mechanically — deriving or cross-checking the checklist against `toQuestions` — replacing the prose anchor; this record leaves that slot open rather than freezing the current hand-sync as the design.

## Alternatives considered

**Remodel the tool schema to eliminate the constraints.** Drop the `grill_` prefix (its design-time rationale, race discrimination, died when the race moved inside `execute` — the prefix survives in code only as the reserved-id namespace) and switch `recommended` from index to label reference (killing the range coupling). It lost on direction: the schema is a public, evolving contract and an ask-first boundary; reshaping it to flatter model habits optimizes the wrong axis and spends contract churn for a first-shot win the disclosure route can get without touching it.

**Widen the enforced schema subset upstream (pattern/minItems/minimum).** The root fix for the general mechanism — value constraints would become schema-carried and pre-visible. It lost on ownership and architecture: the Harness is an upstream repository we do not control, and its subset is deliberately narrow because it also drives TS/Python type generation (`ts-types`, `py-types`, PTC); value-level keywords map to no static type, so the proposal fights the design, not just the review queue.

**Fold the rules into the tool description.** Zero new surfaces — the description is already visible. It lost on cost and timing: the description is per-request context billed on every turn for rules the model needs once; and at description length the eleven rules would crowd out the routing guidance that lives there now.

**Apply the same generated-inline treatment to the packaged CLI skill** (`skills/grilling-sleek/SKILL.md`, generated from `schemas/grilling.json` under a freshness gate). The same disclosure argument applies there — the file read is skippable and the hand-written quick reference can drift — but this batch is scoped to dsh by decision; the CLI skill stays as shipped, and that route remains open for a future record.

**Accept the loop; improve error messages only.** `mapping.ts` errors already name the offending question id and the violated rule, and richer errors shorten each cycle. It lost as a primary fix because it keeps the learning outside-in (error-driven) exactly where it could be inside-out (disclosure-driven); better errors remain the fallback layer under any route.

## Consequences

The model now receives the full rejection surface of `grill_user` at skill-load time; first-call rejections should fall from "whatever prose happened to cover" to the model-attention floor, and the loop, when it still fires, converges in one error round instead of one per constraint. The disclosure travels with the plugin's own runtime skill registration — no host changes, no schema changes, no new package surface.

The cost is a hand-synced pair: eleven checklist lines in `skill.ts` mirror eleven checks in `mapping.ts`, held together by JSDoc cross-references, one test-level presence anchor, and reviewer discipline — a known drift window until the future mechanical gate (left open above) closes it. The skill body grows by the checklist, a one-time load cost against a per-request alternative, and the constraints' phrasing now lives in model-facing prose, so wording changes there are product-visible in a way code comments are not. The schema's evolution is untouched: when a constraint is added or relaxed in `mapping.ts`, the same change moves its line in the checklist, and the record's expectation is exactly that batching.
