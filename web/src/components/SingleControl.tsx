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
                className="body-sm text-ink border-hairline bg-canvas hover:border-hairline-strong data-[selected=true]:bg-primary data-[selected=true]:text-on-primary data-[selected=true]:border-primary rounded-[var(--radius-pill-sm)] border px-[var(--spacing-md)] py-[var(--spacing-xs)]"
              >
                {val === "yes" ? t("yes") : t("no")}
                {isRecommended && (
                  <span
                    className={`ml-1.5 text-xs ${selected === val ? "text-on-primary" : "text-mute"}`}
                  >
                    ({t("recommended")})
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {question.allow_custom_text !== false && (
          <CustomTextInput
            value={value?.custom_text}
            onChange={(ct) => onChange({ selected, custom_text: ct })}
            t={t}
            questionId={question.id}
          />
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
                className="body-sm text-ink border-hairline bg-canvas hover:border-hairline-strong data-[selected=true]:bg-primary data-[selected=true]:text-on-primary data-[selected=true]:border-primary min-w-[48px] rounded-[var(--radius-pill-sm)] border px-[var(--spacing-md)] py-[var(--spacing-xs)] text-center"
              >
                {val}
                {isRecommended && (
                  <span
                    className={`block text-xs ${selected === val ? "text-on-primary" : "text-mute"}`}
                  >
                    ({t("recommended")})
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {question.allow_custom_text !== false && (
          <CustomTextInput
            value={value?.custom_text}
            onChange={(ct) => onChange({ selected, custom_text: ct })}
            t={t}
            questionId={question.id}
          />
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
        {/* "None of the above" option — only for optional questions */}
        {question.required === false && (
          <label
            data-selected={selected === ""}
            className="border-hairline bg-canvas hover:border-hairline-strong data-[selected=true]:border-primary flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border px-[var(--spacing-sm)] transition-colors"
          >
            <Radio.Root
              value=""
              className={`flex size-4 items-center justify-center rounded-full border-2 transition-colors ${selected === "" ? "border-primary bg-primary" : "border-hairline-strong"}`}
            >
              <Radio.Indicator className="bg-on-primary size-2 rounded-full" />
            </Radio.Root>
            <span className="text-ink text-sm">{t("noSelection")}</span>
          </label>
        )}
        {options.map((opt, i) => {
          const isRecommended = question.recommended === i;
          const isSelected = selected === opt.label;
          return (
            <label
              key={opt.label}
              data-selected={isSelected}
              className="border-hairline bg-canvas hover:border-hairline-strong data-[selected=true]:border-primary flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border px-[var(--spacing-sm)] transition-colors"
            >
              <Radio.Root
                value={opt.label}
                className={`flex size-4 items-center justify-center rounded-full border-2 transition-colors ${isSelected ? "border-primary bg-primary" : "border-hairline-strong"}`}
              >
                <Radio.Indicator className="bg-on-primary size-2 rounded-full" />
              </Radio.Root>
              <span className="text-ink text-sm">{opt.label}</span>
              {isRecommended && (
                <span className="bg-canvas-soft caption text-body ml-auto inline-flex items-center rounded-[var(--radius-full)] px-[var(--spacing-xs)]">
                  {t("recommended")}
                </span>
              )}
            </label>
          );
        })}
      </RadioGroup>
      {question.allow_custom_text !== false && (
        <CustomTextInput
          value={value?.custom_text}
          onChange={(ct) => onChange({ selected, custom_text: ct })}
          t={t}
          questionId={question.id}
        />
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
      className="border-hairline bg-canvas body-sm text-ink placeholder:text-mute focus:border-hairline-strong mt-[var(--spacing-xs)] h-10 w-full rounded-[var(--radius-sm)] border px-[var(--spacing-sm)] transition-colors focus:outline-none"
    />
  );
}
