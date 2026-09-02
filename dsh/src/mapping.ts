/**
 * Value mapping between the three grilling forms: the model-authored tool
 * args, the `userQuestions` items, and the Hub wire payloads — plus the value
 * constraints the parameter schema cannot express (the schema is the parsing
 * boundary; these checks guard model JSON it cannot shape). Each
 * {@link toQuestions} check has a counterpart line in the runtime skill
 * body's Construction rules (`skill.ts`) — the model's only pre-call view of
 * these constraints. When a check changes here, move its line there in the
 * same change; a future gate will enforce that sync mechanically instead of
 * this prose anchor.
 *
 * @module @grilling-sleek/dsh-tool-grill-user/mapping
 */

import type { AskUserQuestionItem } from "@deepseek-ai/dsh-user-questions";
import type { GrillingAnswer, GrillingQuestion } from "./types.ts";
import type { HubGrilling, HubQuestion, HubResponseInput, HubStoredResponse } from "./hub.ts";

/** Id of the free-text catch-all question appended to every round. */
export const ADDITIONAL_NOTES_ID = "grill_additional_notes";

/** The `grill_`-prefixed snake_case grammar every question id must follow. */
const ID_PATTERN = /^grill_[a-z0-9]+(?:_[a-z0-9]+)*$/;

/** The catch-all question every round asks, in the user-questions form. */
const ADDITIONAL_NOTES_ITEM: AskUserQuestionItem = {
  id: ADDITIONAL_NOTES_ID,
  header: "Notes",
  question: "Anything else the agent should know before proceeding?",
};

/**
 * The line the first question's detail carries when the round also races on a
 * Hub: the answer-page URL last and bare — auto-linking swallows trailing
 * punctuation, so nothing may follow the URL. The first question is where the
 * line belongs: paged question UIs bury later detail, and the URL's reader is
 * the user deciding where to answer, before they start.
 */
function answerPageDetail(hubUrl: string): string {
  return `Also answerable in the browser: ${hubUrl}`;
}

/**
 * Validate the constraints the parameter schema cannot express and
 * canonicalize the batch: a trimmed non-empty branch, 1..max questions,
 * `grill_`-prefixed snake_case ids unique in the batch (the reserved
 * catch-all id included), non-empty trimmed headers, questions, and option
 * labels, two or more options whenever options exist, and `recommended`
 * indexing a real option.
 * @param branch - the decision-tree branch this round grills.
 * @param questions - the model-supplied batch, already schema-checked.
 * @param maxQuestions - deployment's per-round question cap.
 * @returns the canonical branch and question list.
 */
export function toQuestions(
  branch: string,
  questions: GrillingQuestion[],
  maxQuestions: number,
): { branch: string; questions: GrillingQuestion[] } {
  const trimmedBranch = branch.trim();
  if (trimmedBranch.length === 0) throw new Error("grill_user requires a non-empty branch");
  if (questions.length === 0 || questions.length > maxQuestions) {
    throw new Error(`grill_user requires 1..${maxQuestions} questions (got ${questions.length})`);
  }
  const canonical: GrillingQuestion[] = [];
  const seen = new Set<string>();
  for (const question of questions) {
    if (!ID_PATTERN.test(question.id)) {
      throw new Error(
        `grill_user question id ${JSON.stringify(question.id)} must be snake_case with the grill_ prefix`,
      );
    }
    if (question.id === ADDITIONAL_NOTES_ID) {
      throw new Error(
        `grill_user question id ${ADDITIONAL_NOTES_ID} is reserved for the notes catch-all`,
      );
    }
    if (seen.has(question.id))
      throw new Error(`grill_user repeats question id ${JSON.stringify(question.id)}`);
    seen.add(question.id);
    if (question.header.trim().length === 0) {
      throw new Error(`grill_user question ${question.id} requires a non-empty header`);
    }
    if (question.question.trim().length === 0) {
      throw new Error(`grill_user question ${question.id} requires non-empty text`);
    }
    const options = question.options?.map((option) => ({ ...option, label: option.label.trim() }));
    if (options !== undefined && options.length < 2) {
      throw new Error(`grill_user question ${question.id} needs at least two options`);
    }
    for (const option of options ?? []) {
      if (option.label.length === 0) {
        throw new Error(`grill_user question ${question.id} has an empty option label`);
      }
    }
    if (
      question.recommended !== undefined &&
      (options === undefined || question.recommended < 0 || question.recommended >= options.length)
    ) {
      throw new Error(
        `grill_user question ${question.id} recommends index ${question.recommended} of ${options?.length ?? 0} options`,
      );
    }
    if (question.multiSelect === true && options === undefined) {
      throw new Error(`grill_user question ${question.id} cannot multi-select without options`);
    }
    if (question.maxLength !== undefined && question.maxLength < 1) {
      throw new Error(`grill_user question ${question.id} maxLength must be positive`);
    }
    canonical.push({
      ...question,
      header: question.header.trim(),
      question: question.question.trim(),
      ...(options !== undefined ? { options } : {}),
    });
  }
  return { branch: trimmedBranch, questions: canonical };
}

/**
 * Project a canonical batch onto the user-questions form: `recommended` and
 * `explanation` fold into `detail` (rendered beside the question, never into
 * option labels), and the notes catch-all rides at the end. When the round
 * opened on a Hub, its answer-page URL rides the first question's `detail` —
 * the one page every answerer sees — with nothing after the URL.
 * @param questions - the canonical batch from {@link toQuestions}.
 * @param hubUrl - the opened Hub round's answer-page URL, if any.
 * @returns the question list for `ctx.userQuestions.ask`.
 */
export function toAskItems(questions: GrillingQuestion[], hubUrl?: string): AskUserQuestionItem[] {
  const items = questions.map((question, index): AskUserQuestionItem => {
    const parts = [recommendedDetail(question)];
    if (index === 0 && hubUrl !== undefined) parts.push(answerPageDetail(hubUrl));
    const detail = parts.filter((part) => part !== undefined).join(" ");
    return {
      id: question.id,
      header: question.header,
      question: question.question,
      ...(question.options !== undefined
        ? { options: question.options.map((option) => ({ ...option })) }
        : {}),
      ...(question.multiSelect === true ? { multiSelect: true } : {}),
      ...(detail !== "" ? { detail } : {}),
    };
  });
  items.push(ADDITIONAL_NOTES_ITEM);
  return items;
}

/**
 * Build the recommendation sentence for one question, or undefined when the
 * question states none. Always a complete sentence: the answer-page line may
 * follow it in the same `detail`.
 * @param question - the canonical question.
 * @returns the `detail` text carrying the recommendation.
 */
function recommendedDetail(question: GrillingQuestion): string | undefined {
  const { options, recommended, explanation } = question;
  if (options === undefined || recommended === undefined) return undefined;
  const option = options[recommended];
  if (option === undefined)
    throw new Error(`grill_user question ${question.id} recommends out of range`);
  return explanation === undefined
    ? `Recommended: ${option.label}.`
    : `Recommended: ${option.label}, because ${explanation}.`;
}

/**
 * Build the Hub wire payload for one round: the branch becomes the batch
 * name, optionless questions map to `text`, and the notes field is always
 * configured so both answer surfaces offer it.
 * @param branch - the canonical branch.
 * @param questions - the canonical batch.
 * @returns the Hub question batch.
 */
export function toHubGrilling(branch: string, questions: GrillingQuestion[]): HubGrilling {
  const mapped: HubQuestion[] = questions.map((question): HubQuestion => ({
    id: question.id,
    header: question.header,
    text: question.question,
    type:
      question.options === undefined ? "text" : question.multiSelect === true ? "multi" : "single",
    ...(question.options !== undefined
      ? { options: question.options.map((option) => ({ ...option })) }
      : {}),
    ...(question.recommended !== undefined ? { recommended: question.recommended } : {}),
    ...(question.explanation !== undefined ? { explanation: question.explanation } : {}),
    ...(question.required !== undefined ? { required: question.required } : {}),
    ...(question.placeholder !== undefined ? { placeholder: question.placeholder } : {}),
    ...(question.maxLength !== undefined ? { max_length: question.maxLength } : {}),
  }));
  return { name: branch, additional_notes: {}, questions: mapped };
}

/**
 * Rebuild the canonical question list from a stored Hub grilling — the
 * inverse of {@link toHubGrilling}, used when mapping the latest answers of a
 * round the model did not ask about in this call (a revision delivered by
 * the watermark sync or the watcher).
 * @param grilling - the stored Hub grilling of the revised round.
 * @returns the canonical questions the stored answers map against.
 */
export function hubGrillingToQuestions(grilling: HubGrilling): GrillingQuestion[] {
  return grilling.questions.map((question): GrillingQuestion => ({
    id: question.id,
    header: question.header,
    question: question.text,
    ...(question.options !== undefined
      ? { options: question.options.map((option) => ({ ...option })) }
      : {}),
    ...(question.type === "multi" ? { multiSelect: true } : {}),
    ...(question.recommended !== undefined ? { recommended: question.recommended } : {}),
    ...(question.explanation !== undefined ? { explanation: question.explanation } : {}),
    ...(question.required !== undefined ? { required: question.required } : {}),
    ...(question.placeholder !== undefined ? { placeholder: question.placeholder } : {}),
    ...(question.max_length !== undefined ? { maxLength: question.max_length } : {}),
  }));
}

/**
 * Normalize a stored Hub response into the link-neutral answer list. The
 * question list decides how each wire answer reads: a free-text question
 * carries its answer in `selected` (the answer page's text field), which
 * becomes `custom`; an optioned question carries labels, `custom_text`
 * optional beside them. The notes catch-all answer synthesizes from the
 * global field.
 * @param questions - the canonical batch the response belongs to.
 * @param response - the stored Hub response.
 * @returns answers in the form the tool returns and the log records.
 */
export function hubResponseToAnswers(
  questions: GrillingQuestion[],
  response: HubStoredResponse,
): GrillingAnswer[] {
  const answers: GrillingAnswer[] = [];
  for (const question of questions) {
    const entry = response.answers[question.id];
    if (entry === undefined) continue;
    const selected = Array.isArray(entry.selected)
      ? entry.selected
      : entry.selected === ""
        ? []
        : [entry.selected];
    if (question.options === undefined) {
      const typed = selected[0] ?? entry.custom_text ?? "";
      answers.push({ id: question.id, selected: [], ...(typed !== "" ? { custom: typed } : {}) });
    } else {
      answers.push({
        id: question.id,
        selected,
        ...(entry.custom_text !== undefined && entry.custom_text !== ""
          ? { custom: entry.custom_text }
          : {}),
      });
    }
  }
  if (response.additional_notes !== undefined && response.additional_notes !== "") {
    answers.push({ id: ADDITIONAL_NOTES_ID, selected: [], custom: response.additional_notes });
  }
  return answers;
}

/**
 * Build the Hub submission body for a batch's answers. The question list
 * decides each answer's wire shape (single label, label array, or free text);
 * the notes catch-all answer lifts into the global field.
 * @param questions - the canonical batch the answers belong to.
 * @param answers - the answers the winning link returned.
 * @returns the submission body.
 */
export function answersToResponseInput(
  questions: GrillingQuestion[],
  answers: GrillingAnswer[],
): HubResponseInput {
  const byId = new Map(answers.map((answer) => [answer.id, answer]));
  const input: HubResponseInput = { answers: {} };
  for (const question of questions) {
    const answer = byId.get(question.id);
    const custom = answer?.custom ?? "";
    if (question.options === undefined) {
      input.answers[question.id] = { selected: custom };
    } else if (question.multiSelect === true) {
      input.answers[question.id] = { selected: answer?.selected ?? [] };
    } else {
      input.answers[question.id] = {
        selected: answer?.selected[0] ?? "",
        ...(custom !== "" ? { custom_text: custom } : {}),
      };
    }
  }
  const notes = byId.get(ADDITIONAL_NOTES_ID)?.custom;
  if (notes !== undefined && notes !== "") input.additional_notes = notes;
  return input;
}
