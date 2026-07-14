// QuestionsPage — the form page (questions + additional_notes + submit).
//
// Uses React Hook Form with a Zod schema resolver. Each question is wrapped
// in a Controller that delegates to the appropriate control component.
// Migrated from app.ts:455-502 (renderQuestions) + app.ts:834-858 (handleSubmit).
//
// formCache (from useGrillingMachine) preserves values across round switches.

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import type { RoundData, Answer, Question, AdditionalNotes } from "../types";
import { buildRoundSchema } from "../lib/schemas";
import { QuestionCard } from "../components/QuestionCard";
import { SingleControl } from "../components/SingleControl";
import { MultiControl } from "../components/MultiControl";
import { TextControl } from "../components/TextControl";

interface QuestionsPageProps {
  round: RoundData;
  cachedValues: Record<string, Answer> | undefined;
  bannerMessage: string | null;
  onBanner: (msg: string | null) => void;
  onSubmit: (answers: Record<string, Answer>, additionalNotes?: string) => void;
  onRetry: () => void;
}

type FormValues = Record<string, Answer> & { additional_notes?: string };

export function QuestionsPage({
  round,
  cachedValues,
  bannerMessage,
  onBanner,
  onSubmit,
  onRetry,
}: QuestionsPageProps) {
  const { t } = useTranslation();
  const grilling = round.grilling;
  const questions = grilling.questions;
  const additionalNotesConfig = grilling.additional_notes ?? null;

  const schema = buildRoundSchema(questions, additionalNotesConfig);

  // Build default values from cache (or empty).
  const defaultValues: FormValues = {};
  for (const q of questions) {
    const cached = cachedValues?.[q.id];
    if (cached) {
      defaultValues[q.id] = cached;
    } else {
      defaultValues[q.id] = {
        selected: q.type === "multi" ? [] : "",
        custom_text: "",
      };
    }
  }
  if (additionalNotesConfig) {
    defaultValues.additional_notes = "";
  }

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues,
    mode: "onSubmit",
  });

  const onValid = (data: FormValues) => {
    const answers: Record<string, Answer> = {};
    for (const q of questions) {
      answers[q.id] = data[q.id];
    }
    const notes = additionalNotesConfig ? data.additional_notes : undefined;
    onSubmit(answers, notes?.trim() || undefined);
  };

  const renderControl = (q: Question, value: Answer | undefined, onChange: (v: Answer) => void) => {
    switch (q.type) {
      case "single":
        return <SingleControl question={q} value={value} onChange={onChange} />;
      case "multi":
        return <MultiControl question={q} value={value} onChange={onChange} />;
      case "text":
        return <TextControl question={q} value={value} onChange={onChange} />;
    }
  };

  const errorKey = (q: Question): string => {
    const err = errors[q.id];
    if (!err) return "";
    // Map Zod error to i18n key
    const msg = err.selected?.message ?? err.message ?? "";
    return mapErrorMessage(q, msg, t);
  };

  return (
    <div>
      {grilling.name && (
        <h1 className="display-lg text-ink mb-[var(--spacing-xs)]">{grilling.name}</h1>
      )}
      {grilling.description && (
        <p className="body-sm text-body mb-[var(--spacing-xl)]">{grilling.description}</p>
      )}

      {bannerMessage && (
        <BannerInline message={bannerMessage} onRetry={onRetry} retryLabel={t("retry")} onDismiss={() => onBanner(null)} />
      )}

      <form onSubmit={handleSubmit(onValid)}>
        {questions.map((q) => (
          <Controller
            key={q.id}
            control={control}
            name={q.id}
            render={({ field }) => (
              <QuestionCard question={q} error={errorKey(q)}>
                {renderControl(q, field.value, field.onChange)}
              </QuestionCard>
            )}
          />
        ))}

        {additionalNotesConfig && (
          <Controller
            control={control}
            name="additional_notes"
            render={({ field }) => (
              <AdditionalNotesField
                config={additionalNotesConfig}
                value={field.value as string}
                onChange={field.onChange}
                error={errors.additional_notes?.message ? t("errNotesRequired") : ""}
                t={t}
              />
            )}
          />
        )}

        <div className="mt-[var(--spacing-xl)]">
          <button
            type="submit"
            className="w-full h-12 rounded-[var(--radius-pill)] bg-primary px-[var(--spacing-sm)] button-lg text-on-primary hover:opacity-90 transition-opacity"
          >
            {t("submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Maps a Zod validation message code to a user-facing i18n string. */
function mapErrorMessage(q: Question, code: string, t: (key: string, params?: Record<string, unknown>) => string): string {
  const h = q.header;
  switch (code) {
    case "required":
      if (q.type === "single") {
        if (q.variant === "yesno") return t("errYesNo", { h });
        if (q.variant === "rating") return t("errSelectRating", { h });
        return t("errSelectOne", { h });
      }
      if (q.type === "text") return t("errTextRequired", { h });
      return t("errSelectOne", { h });
    case "min-one":
      return t("errMultiMin", { h });
    case "too-long":
      return t("errTextTooLong", { h, n: q.max_length ?? 0 });
    default:
      return code;
  }
}

function AdditionalNotesField({
  config,
  value,
  onChange,
  error,
  t,
}: {
  config: AdditionalNotes;
  value: string;
  onChange: (v: string) => void;
  error: string;
  t: (key: string) => string;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-hairline bg-canvas-soft px-[var(--spacing-lg)] py-[var(--spacing-lg)] mb-[var(--spacing-md)] mt-[var(--spacing-xs)]">
      <label className="block font-semibold text-sm text-ink mb-[var(--spacing-xxs)]">
        {config.label || t("additionalNotesDefault")}
        {config.required && <span className="text-error ml-0.5">*</span>}
      </label>
      {error && <p className="text-sm text-error mb-[var(--spacing-xs)]">{error}</p>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={config.placeholder || t("additionalNotesDefault")}
        maxLength={config.max_length}
        className="w-full min-h-[80px] rounded-[var(--radius-sm)] border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-mute focus:outline-none focus:border-hairline-strong resize-y transition-colors"
      />
    </div>
  );
}

function BannerInline({
  message,
  onRetry,
  retryLabel,
  onDismiss,
}: {
  message: string;
  onRetry: () => void;
  retryLabel: string;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-error-deep bg-error-soft px-[var(--spacing-md)] py-[var(--spacing-sm)] mb-[var(--spacing-md)] shadow-[var(--shadow-toast)]" role="alert">
      <span className="text-sm text-error-deep">{message}</span>
      <div className="flex gap-2 shrink-0">
        <button type="button" onClick={onRetry} className="rounded-[var(--radius-sm)] bg-white px-3 py-1.5 text-sm font-medium text-error-deep hover:bg-error-soft transition-colors">
          {retryLabel}
        </button>
        <button type="button" onClick={onDismiss} className="rounded-[var(--radius-sm)] px-2 py-1.5 text-sm text-error-deep transition-colors" aria-label="dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}
