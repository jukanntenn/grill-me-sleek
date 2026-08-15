// §4 Proof — a live mini-round. Real QuestionCard/SingleControl components,
// real interaction; submitting flips the card into a receipt that converts
// (the install command). The demo column matches the app's 640px width —
// this IS what a session looks like.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Answer } from "../../types";
import { QuestionCard } from "../QuestionCard";
import { SingleControl } from "../SingleControl";
import { CommandBox } from "./CommandBox";
import { demoQuestions, initialDemoAnswers } from "./demoData";

export function DemoRound() {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, Answer>>(initialDemoAnswers);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setAnswers(initialDemoAnswers());
    setSubmitted(false);
  };

  return (
    <section className="py-[var(--spacing-4xl)]">
      <div className="mx-auto max-w-[640px] px-[var(--spacing-md)] text-center">
        <h2 className="display-lg text-ink">{t("landing.s4.title")}</h2>
        <p className="body-lg text-body mx-auto mt-[var(--spacing-md)] max-w-[540px]">
          {t("landing.s4.body")}
        </p>
        <div className="mt-[var(--spacing-2xl)] text-left">
          {submitted ? (
            <div
              data-testid="demo-receipt"
              className="border-hairline bg-canvas rounded-[var(--radius-md)] border px-[var(--spacing-lg)] py-[var(--spacing-lg)] shadow-[var(--shadow-card)]"
            >
              <p className="display-sm text-ink">✓ {t("landing.s4.receiptTitle")}</p>
              <p className="body-sm text-body mt-[var(--spacing-xs)]">
                {t("landing.s4.receiptBody")}
              </p>
              <div className="mt-[var(--spacing-md)] flex flex-wrap items-center gap-[var(--spacing-md)]">
                <CommandBox command="npx @grilling-sleek/cli" testId="demo-command" />
                <button
                  type="button"
                  onClick={reset}
                  className="body-sm-strong text-mute hover:text-ink transition-colors"
                >
                  {t("landing.s4.again")}
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSubmitted(true);
              }}
            >
              {demoQuestions.map((q) => (
                <QuestionCard key={q.id} question={q}>
                  <SingleControl
                    question={q}
                    value={answers[q.id]}
                    onChange={(a) => setAnswers((prev) => ({ ...prev, [q.id]: a }))}
                  />
                </QuestionCard>
              ))}
              <div className="mt-[var(--spacing-lg)] text-center">
                <button
                  type="submit"
                  className="bg-primary button-lg text-on-primary h-12 rounded-[var(--radius-pill)] px-[var(--spacing-2xl)] transition-opacity hover:opacity-90"
                >
                  {t("submit")}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
