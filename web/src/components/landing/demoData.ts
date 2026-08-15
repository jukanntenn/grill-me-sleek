// Demo data for the landing page — typed as real Questions so the landing
// renders through the exact same QuestionCard/SingleControl pipeline as a
// live session. Option labels stay in English (technical terms), matching
// what a real grilling round looks like.

import type { Answer, Question } from "../../types";

export const REPO_URL = "https://github.com/jukanntenn/grill-me-sleek";

/** Hero visual — the first question an agent would send (SKILL.md example). */
export const heroQuestion: Question = {
  id: "hero-auth",
  header: "AUTH",
  text: "Which authentication scheme should we use?",
  type: "single",
  options: [
    { label: "Stateless JWT" },
    { label: "Server sessions" },
    { label: "OAuth 2.0 + OIDC" },
  ],
  recommended: 0,
  explanation: "Fits our horizontally-scaled, read-heavy API; refresh tokens cover revocation.",
  allow_custom_text: false,
};

/** Hero radio pre-selected on the recommended option (static preview). */
export const heroAnswer: Answer = { selected: "Stateless JWT", custom_text: "" };

/** §4 interactive mini-round — two questions, recommended answers pre-selected. */
export const demoQuestions: Question[] = [
  {
    id: "demo-storage",
    header: "STORAGE",
    text: "Where do refresh tokens live?",
    type: "single",
    options: [{ label: "Redis" }, { label: "Postgres" }, { label: "Rely on short expiry" }],
    recommended: 0,
    explanation: "State you can flush independently; survives restarts.",
    allow_custom_text: false,
  },
  {
    id: "demo-scope",
    header: "SCOPE",
    text: "Migrate everything at once, or service by service?",
    type: "single",
    options: [{ label: "Service by service" }, { label: "Big-bang migration" }],
    recommended: 0,
    explanation: "Blast radius stays small; rollback is trivial.",
    allow_custom_text: false,
  },
];

/** Initial demo answers — recommended options pre-selected, like QuestionsPage. */
export function initialDemoAnswers(): Record<string, Answer> {
  const answers: Record<string, Answer> = {};
  for (const q of demoQuestions) {
    const label = q.recommended !== undefined ? q.options?.[q.recommended]?.label : undefined;
    answers[q.id] = { selected: label ?? "", custom_text: "" };
  }
  return answers;
}
