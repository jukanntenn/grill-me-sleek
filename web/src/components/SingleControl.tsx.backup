// SingleControl — single-choice question (3 variants).
//
// Vercel design:
//   - default variant: option rows with hairline border, selected = ink polarity flip
//   - yesno variant: tab-ghost pills (rounded.pill-sm 64px), selected = ink fill
//   - rating variant: tab-ghost numbered pills
//
// Uses Base UI RadioGroup + Radio.Root (accessible, keyboard-navigable).
// Migrated from app.ts:551-616.

import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { useTranslation } from "react-i18next";
import type { Question, Answer } from "../types";

interface SingleControlProps {
  question: Question;
  value: Answer | undefined;
  onChange: (answer: Answer) => void;
}

export function SingleControl({ question, value, onChange }: SingleControlProps) {
  const { t } = useTranslation();
  const selected = (value?.selected as string) ?? "";
  const variant = question.variant ?? "default";

  const handleSelect = (val: string) => {
    onChange({
      selected: val,
      custom_text: value?.custom_text ?? "",
    });
  };

  if (variant === "yesno") {
    return (
      <>
        <div className="flex gap-2">
          {(["yes", "no"] as const).map((val) => {
            const isRecommended =
              (question.recommended === 1 && val === "yes") ||
              (question.recommended === 0 && val === "no");
            return (
              <button
                key={val}
                type="button"
                onClick={() => handleSelect(val)}
                data-selected={selected === val}
                className="rounded-[var(--radius-pill-sm)] px-[var(--spacing-md)] py-[var(--spacing-xs)] body-sm text-ink border border-hairline bg-canvas hover:border-hairline-strong data-[selected=true]:bg-primary data-[selected=true]:text-on-primary data-[selected=true]:border-primary"
              >
                {val === "yes" ? t("yes") : t("no")}
                {isRecommended && (
                  <span className={`ml-1.5 text-xs ${selected === val ? "text-on-primary" : "text-mute"}`}>
                    ({t("recommended")})
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {question.allow_custom_text !== false && (
        <CustomTextInput value={value?.custom_text} onChange={(ct) => onChange({ selected, custom_text: ct })} t={t} questionId={question.id} />
      )}
    </>
  );
}

  if (variant === "rating") {
    const max = question.rating_max || 5;
    return (
      <>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: max }, (_, i) => i + 1).map((i) => {
            const val = String(i);
            const isRecommended = question.recommended === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleSelect(val)}
                data-selected={selected === val}
                className="min-w-[48px] rounded-[var(--radius-pill-sm)] px-[var(--spacing-md)] py-[var(--spacing-xs)] body-sm text-ink text-center border border-hairline bg-canvas hover:border-hairline-strong data-[selected=true]:bg-primary data-[selected=true]:text-on-primary data-[selected=true]:border-primary"
              >
                {val}
                {isRecommended && (
                  <span className={`block text-xs ${selected === val ? "text-on-primary" : "text-mute"}`}>
                    ({t("recommended")})
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {question.allow_custom_text !== false && (
          <CustomTextInput value={value?.custom_text} onChange={(ct) => onChange({ selected, custom_text: ct })} t={t} questionId={question.id} />
        )}
      </>
    );
  }

  // default variant — radio group with option labels
  // DESIGN.md: selected = radio indicator ink fill (circle turns ink with
  // on-primary dot); the option row itself keeps its canvas background.
  const options = question.options ?? [];
  return (
    <>
      <RadioGroup
        value={selected}
        onValueChange={(val) => handleSelect(val as string)}
        className="flex flex-col gap-2"
      >
        {options.map((opt, i) => {
          const isRecommended = question.recommended === i;
          const isSelected = selected === opt.label;
          return (
            <label
              key={opt.label}
              data-selected={isSelected}
              className="flex items-center gap-2.5 min-h-10 rounded-[var(--radius-md)] border border-hairline bg-canvas px-[var(--spacing-sm)] cursor-pointer hover:border-hairline-strong data-[selected=true]:border-primary transition-colors"
            >
              <Radio.Root
                value={opt.label}
                className={`size-4 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? "border-primary bg-primary" : "border-hairline-strong"}`}
              >
                <Radio.Indicator className="size-2 rounded-full bg-on-primary" />
              </Radio.Root>
              <span className="text-sm text-ink">{opt.label}</span>
              {isRecommended && (
                <span className="ml-auto inline-flex items-center rounded-[var(--radius-full)] bg-canvas-soft px-[var(--spacing-xs)] caption text-body">
                  {t("recommended")}
                </span>
              )}
            </label>
          );
        })}
      </RadioGroup>
      {question.allow_custom_text !== false && (
        <CustomTextInput value={value?.custom_text} onChange={(ct) => onChange({ selected, custom_text: ct })} t={t} questionId={question.id} />
      )}
    </>
  );
}

/** Inline custom text input (for single/multi questions with allow_custom_text). */
function CustomTextInput({
  value,
  onChange,
  t,
  questionId,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  t: (key: string) => string;
  questionId: string;
}) {
  return (
    <input
      type="text"
      data-testid={`custom-text-${questionId}`}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t("customTextPlaceholder")}
      className="mt-[var(--spacing-xs)] h-10 w-full rounded-[var(--radius-sm)] border border-hairline bg-canvas px-[var(--spacing-sm)] body-sm text-ink placeholder:text-mute focus:outline-none focus:border-hairline-strong transition-colors"
    />
  );
}
