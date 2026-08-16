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
import { Markdown } from "./Markdown";

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
      className="border-hairline bg-canvas-soft mb-[var(--spacing-md)] rounded-[var(--radius-md)] border px-[var(--spacing-lg)] py-[var(--spacing-lg)]"
    >
      <label className="text-ink mb-[var(--spacing-xs)] block text-sm font-semibold">
        {question.header}
        {required && <span className="text-error ml-0.5">*</span>}
      </label>
      {question.text && (
        <div className="mb-[var(--spacing-xs)]">
          <Markdown>{question.text}</Markdown>
        </div>
      )}
      {error ? <p className="text-error mb-[var(--spacing-xs)] text-sm">{error}</p> : null}
      <div className="mt-[var(--spacing-sm)]">{children}</div>
      {/* recommended mark + explanation for yesno/rating shown inline in controls */}
      {question.recommended !== undefined && question.explanation && (
        <div className="text-mute mt-[var(--spacing-xs)] text-xs">
          <span className="mr-1">{t("recommended")} —</span>
          <Markdown>{question.explanation}</Markdown>
        </div>
      )}
    </div>
  );
}
