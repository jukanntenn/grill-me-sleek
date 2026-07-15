// QuestionCard — wrapper for a single question (header + text + error + control).
//
// Vercel design: card-soft — canvas-soft bg, rounded.md 8px, hairline border,
// spacing.lg padding, stacked shadows.
// Inside a card: headline/paragraph stack is tight (spacing.xs 8px gap),
// then a wider gap before the CTA cluster.
// Migrated from app.ts:504-538.

import type { ReactNode } from "react";
import type { Question } from "../types";
import { useTranslation } from "react-i18next";

interface QuestionCardProps {
  question: Question;
  error?: string;
  children: ReactNode;
}

export function QuestionCard({ question, error, children }: QuestionCardProps) {
  const { t } = useTranslation();
  const required = question.required !== false; // default true

  return (
    <div
      data-testid={`question-${question.id}`}
      className="rounded-[var(--radius-md)] border border-hairline bg-canvas-soft px-[var(--spacing-lg)] py-[var(--spacing-lg)] mb-[var(--spacing-md)]"
    >
      <label className="block font-semibold text-sm text-ink mb-[var(--spacing-xs)]">
        {question.header}
        {required && <span className="text-error ml-0.5">*</span>}
      </label>
      {question.text && (
        <p className="text-sm text-body mb-[var(--spacing-xs)]">{question.text}</p>
      )}
      {error ? (
        <p className="text-sm text-error mb-[var(--spacing-xs)]">{error}</p>
      ) : null}
      <div className="mt-[var(--spacing-sm)]">
        {children}
      </div>
      {/* recommended mark + explanation for yesno/rating shown inline in controls */}
      {question.recommended !== undefined && question.explanation && (
        <p className="mt-[var(--spacing-xs)] text-xs text-mute">
          {t("recommended")} — {question.explanation}
        </p>
      )}
    </div>
  );
}
