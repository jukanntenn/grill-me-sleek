/**
 * The grilling-sleek skill body this plugin registers at runtime, so the
 * interview discipline travels with the tool it instructs. Routing lives in
 * the description: skill digests carry name and description only, and
 * `whenToUse` never reaches the model.
 *
 * @module @grilling-sleek/dsh-tool-grill-user/skill
 */

import type { Context } from "@deepseek-ai/cordis";
// Type-only: resolves the ctx.skills service declaration for optional access.
import type {} from "@deepseek-ai/dsh-skill";

/** Model-facing routing description of the grilling-sleek skill. */
export const GRILLING_SKILL_DESCRIPTION =
  "Grill the user relentlessly about a plan, decision, or idea through the native `grill_user` " +
  "tool — the only grilling transport in this harness. Never install or shell out to " +
  "@grilling-sleek/cli: no subprocess CLI is involved, even if repository docs mention one. " +
  "Use when the user wants to stress-test their thinking or uses any 'grill' trigger phrase.";

/** The interview discipline, rewritten for the native `grill_user` tool. */
export const GRILLING_SKILL_CONTENT = `# Grilling Sleek

Interview me relentlessly about the plan, decision, or idea I brought: map it to a decision tree, then walk down one branch at a time, asking the questions that would expose weak assumptions before any work starts.

Transport: the \`grill_user\` tool alone. It races every answer surface for you — the question cards this harness already shows, and the Hub answer page whose URL each result carries. Never spawn \`@grilling-sleek/cli\`, never call the Hub REST API yourself, never build your own question forms: a subprocess CLI has no part in this harness even when repository docs describe one.

Discipline:

- One decision-tree branch per \`grill_user\` call. Never batch the whole tree into one round, and never open a second round before the previous one is answered.
- For every question, state your recommended answer (\`recommended\` + \`explanation\`). I decide; you recommend.
- Verify facts in the environment first — read the code, config, or logs a question depends on. Do not ask me things you can look up.
- Decisions belong to me. Do not act on the plan until I explicitly confirm we have reached a shared understanding.
- Grill from the main agent. A subagent has no human answerer: resolve your own remaining questions and include them in your final report.

Build each call's questions with stable \`grill_\`-prefixed snake_case ids, a short \`header\`, the full \`question\`, and — when the question has choices — two or more \`options\` with your recommendation marked. Omit \`options\` for free-text questions. Answers come back as structured JSON (\`answers[]\` with \`id\`, selected \`selected\` labels, and free \`custom\` text); treat them as my decisions for that branch. When a result carries \`hub.url\`, repeat that link alone on its own line in your reply — alone, because auto-linking swallows trailing punctuation — so I can reach the answer page for the next round.

When the grilling concludes, summarize the decisions taken across all rounds before proceeding.
`;

/**
 * Register the grilling-sleek runtime skill when a skill registry is present.
 * A composition without one is not misconfiguration — the tool works without
 * a catalog entry — so absence is a silent no-op, not a load failure.
 * @param ctx - the plugin's registrant context; the registration is an
 *   effect on it and disappears with the plugin.
 */
export function registerGrillingSkill(ctx: Context): void {
  const skills = ctx.get("skills");
  if (skills === undefined) return;
  skills.register({
    name: "grilling-sleek",
    description: GRILLING_SKILL_DESCRIPTION,
    source: "runtime",
    content: GRILLING_SKILL_CONTENT,
  });
}
