// MultiControl — multi-choice question (checkbox group).
//
// Vercel design: same option-row style as SingleControl(default) — hairline border,
// selected = ink polarity flip. Uses Base UI Checkbox.Root.
// Migrated from app.ts:618-643.

import { Checkbox } from "@base-ui/react/checkbox";
import { useTranslation } from "react-i18next";
import type { Question, Answer } from "../types";

interface MultiControlProps {
  question: Question;
  value: Answer | undefined;
  onChange: (answer: Answer) => void;
}

export function MultiControl({ question, value, onChange }: MultiControlProps) {
  const { t } = useTranslation();
  const selected = Array.isArray(value?.selected) ? value.selected : [];
  const options = question.options ?? [];

  const toggle = (label: string, checked: boolean) => {
    const next = checked ? [...selected, label] : selected.filter((s) => s !== label);
    onChange({
      selected: next,
      custom_text: value?.custom_text ?? "",
    });
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        {options.map((opt, i) => {
          const isRecommended = question.recommended === i;
          const isChecked = selected.includes(opt.label);
          return (
            <label
              key={opt.label}
              data-selected={isChecked}
              className="border-hairline bg-canvas hover:border-hairline-strong data-[selected=true]:border-primary flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border px-[var(--spacing-sm)] transition-colors"
            >
              <Checkbox.Root
                checked={isChecked}
                onCheckedChange={(checked) => toggle(opt.label, checked as boolean)}
                className={`flex size-4 items-center justify-center rounded-[var(--radius-xs)] border-2 transition-colors ${isChecked ? "border-primary bg-primary" : "border-hairline-strong"}`}
              >
                <Checkbox.Indicator className="text-on-primary text-xs leading-none font-bold">
                  ✓
                </Checkbox.Indicator>
              </Checkbox.Root>
              <span className="text-ink text-sm">{opt.label}</span>
              {isRecommended && (
                <span className="bg-canvas-soft caption text-body ml-auto inline-flex items-center rounded-[var(--radius-full)] px-[var(--spacing-xs)]">
                  {t("recommended")}
                </span>
              )}
            </label>
          );
        })}
      </div>
      {question.allow_custom_text !== false && (
        <input
          type="text"
          value={value?.custom_text ?? ""}
          onChange={(e) => onChange({ selected, custom_text: e.target.value })}
          placeholder={t("customTextPlaceholder")}
          className="border-hairline bg-canvas body-sm text-ink placeholder:text-mute focus:border-hairline-strong mt-[var(--spacing-xs)] h-10 w-full rounded-[var(--radius-sm)] border px-[var(--spacing-sm)] transition-colors focus:outline-none"
        />
      )}
    </>
  );
}
