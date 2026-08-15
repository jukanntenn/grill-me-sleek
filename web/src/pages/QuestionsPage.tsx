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
    } else if (q.recommended !== undefined) {
      // Auto-select recommended option
      if (q.type === "single") {
        let recommendedValue = "";
        if (q.variant === "yesno") {
          recommendedValue = q.recommended === 0 ? "no" : "yes";
        } else if (q.variant === "rating") {
          recommendedValue = String(q.recommended);
        } else if (q.options && q.recommended >= 0 && q.recommended < q.options.length) {
          recommendedValue = q.options[q.recommended].label;
        }
        defaultValues[q.id] = { selected: recommendedValue, custom_text: "" };
      } else if (
        q.type === "multi" &&
        q.options &&
        q.recommended >= 0 &&
        q.recommended < q.options.length
      ) {
        const recommendedOption = q.options[q.recommended].label;
        defaultValues[q.id] = {
          selected: [recommendedOption],
          custom_text: "",
        };
      } else {
        defaultValues[q.id] = {
          selected: q.type === "multi" ? [] : "",
          custom_text: "",
        };
      }
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
      {/* Round indicator */}
      <div className="mb-[var(--spacing-md)]">
        <span className="text-mute text-sm">
          {round.name
            ? t("roundWithName", { n: round.round, name: round.name })
            : t("round", { n: round.round })}
        </span>
      </div>
      {grilling.name && (
        <h1 className="display-lg text-ink mb-[var(--spacing-xs)]">{grilling.name}</h1>
      )}
      {grilling.description && (
        <p className="body-sm text-body mb-[var(--spacing-xl)]">{grilling.description}</p>
      )}

      {bannerMessage && (
        <BannerInline
          message={bannerMessage}
          onRetry={onRetry}
          retryLabel={t("retry")}
          onDismiss={() => onBanner(null)}
        />
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
            className="bg-primary button-lg text-on-primary h-12 w-full rounded-[var(--radius-pill)] px-[var(--spacing-sm)] transition-opacity hover:opacity-90"
          >
            {t("submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Maps a Zod validation message code to a user-facing i18n string. */
function mapErrorMessage(
  q: Question,
  code: string,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
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
  const label = config.label || t("additionalNotesDefault");
  return (
    <div
      data-testid="additional-notes"
      className="border-hairline bg-canvas-soft mt-[var(--spacing-xs)] mb-[var(--spacing-md)] rounded-[var(--radius-md)] border px-[var(--spacing-lg)] py-[var(--spacing-lg)]"
    >
      <label
        htmlFor="additional-notes"
        className="text-ink mb-[var(--spacing-xxs)] block text-sm font-semibold"
      >
        {label}
        {config.required && <span className="text-error ml-0.5">*</span>}
      </label>
      {error && <p className="text-error mb-[var(--spacing-xs)] text-sm">{error}</p>}
      <textarea
        id="additional-notes"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={config.placeholder || t("additionalNotesDefault")}
        maxLength={config.max_length}
        className="border-hairline bg-canvas text-ink placeholder:text-mute focus:border-hairline-strong min-h-[80px] w-full resize-y rounded-[var(--radius-sm)] border px-3 py-2 text-sm transition-colors focus:outline-none"
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
    <div
      className="border-error-deep bg-error-soft mb-[var(--spacing-md)] flex items-center justify-between gap-3 rounded-[var(--radius-md)] border px-[var(--spacing-md)] py-[var(--spacing-sm)] shadow-[var(--shadow-toast)]"
      role="alert"
    >
      <span className="text-error-deep text-sm">{message}</span>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="text-error-deep hover:bg-error-soft rounded-[var(--radius-sm)] bg-white px-3 py-1.5 text-sm font-medium transition-colors"
        >
          {retryLabel}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-error-deep rounded-[var(--radius-sm)] px-2 py-1.5 text-sm transition-colors"
          aria-label="dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
