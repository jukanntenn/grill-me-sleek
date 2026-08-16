// ReviewRoundPage — read-only view of an answered round (question + your
// answer + notes + revision count), with the entry point into revise mode.

import { useTranslation } from "react-i18next";
import type { RoundData, Answer } from "../types";
import { Markdown } from "../components/Markdown";

interface ReviewRoundPageProps {
  /** Round whose response is non-null. */
  round: RoundData;
  onRevise: () => void;
  onBack: () => void;
}

export function ReviewRoundPage({ round, onRevise, onBack }: ReviewRoundPageProps) {
  const { t } = useTranslation();
  const grilling = round.grilling;
  const response = round.response!;
  const revisions = (response.revision ?? 1) - 1;

  return (
    <div data-testid={`review-round-${round.round}`}>
      {/* Header: back + round title + status */}
      <div className="mb-[var(--spacing-md)]">
        <button
          type="button"
          onClick={onBack}
          data-testid="back-to-current"
          className="text-primary mb-[var(--spacing-xs)] text-sm hover:underline"
        >
          ‹ {t("backToCurrent")}
        </button>
        <div className="flex flex-wrap items-baseline gap-x-[var(--spacing-sm)] gap-y-1">
          <h1 className="text-ink text-base font-semibold">
            {round.name
              ? t("roundWithName", { n: round.round, name: round.name })
              : t("round", { n: round.round })}
          </h1>
          <span className="text-mute text-xs" data-testid="review-status">
            {t("answered")}
            {revisions > 0 && ` · ${t("revisedTimes", { n: revisions })}`}
          </span>
        </div>
      </div>

      {grilling.description && (
        <div className="border-hairline bg-canvas-soft mb-[var(--spacing-lg)] rounded-[var(--radius-md)] border px-[var(--spacing-lg)] py-[var(--spacing-md)]">
          <Markdown>{grilling.description}</Markdown>
        </div>
      )}

      {/* Questions with the submitted answers */}
      {grilling.questions.map((q) => (
        <div
          key={q.id}
          data-testid={`review-question-${q.id}`}
          className="border-hairline bg-canvas-soft mb-[var(--spacing-md)] rounded-[var(--radius-md)] border px-[var(--spacing-lg)] py-[var(--spacing-lg)]"
        >
          <p className="text-ink mb-[var(--spacing-xs)] text-sm font-semibold">{q.header}</p>
          {q.text && (
            <div className="mb-[var(--spacing-sm)]">
              <Markdown>{q.text}</Markdown>
            </div>
          )}
          <AnswerView answer={response.answers[q.id]} label={t("yourAnswer")} />
        </div>
      ))}

      {response.additional_notes && (
        <div
          data-testid="review-notes"
          className="border-hairline bg-canvas-soft mb-[var(--spacing-md)] rounded-[var(--radius-md)] border px-[var(--spacing-lg)] py-[var(--spacing-lg)]"
        >
          <p className="text-ink mb-[var(--spacing-xs)] text-sm font-semibold">{t("yourAnswer")}</p>
          <p className="text-body text-sm whitespace-pre-wrap">{response.additional_notes}</p>
        </div>
      )}

      <button
        type="button"
        onClick={onRevise}
        data-testid="revise-button"
        className="border-hairline text-body hover:border-hairline-strong hover:bg-canvas-soft h-12 w-full rounded-[var(--radius-pill)] border px-[var(--spacing-sm)] text-sm font-medium transition-colors"
      >
        ✏ {t("reviseThisRound")}
      </button>
    </div>
  );
}

/** Read-only rendering of one submitted answer. */
function AnswerView({ answer, label }: { answer: Answer | undefined; label: string }) {
  if (!answer) {
    return <p className="text-mute text-sm">{label}: —</p>;
  }

  const selected = Array.isArray(answer.selected) ? answer.selected : [answer.selected];
  return (
    <div className="border-hairline bg-canvas rounded-[var(--radius-sm)] border px-[var(--spacing-md)] py-[var(--spacing-sm)]">
      <p className="text-mute mb-[var(--spacing-xxs)] text-xs">{label}</p>
      {selected.length > 0 ? (
        <ul className="list-none space-y-0.5">
          {selected.map((s, i) => (
            <li key={i} className="text-body text-sm">
              ● {s}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-sm">—</p>
      )}
      {answer.custom_text && (
        <p className="text-body mt-[var(--spacing-xxs)] text-sm">{answer.custom_text}</p>
      )}
    </div>
  );
}
