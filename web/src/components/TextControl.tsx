// TextControl — free-text question (textarea).
//
// Vercel design: form-input — 80px min height, hairline border, rounded.sm 6px.
// Migrated from app.ts:645-658.

import type { Answer } from "../types";

interface TextControlProps {
  question: { placeholder?: string; max_length?: number };
  value: Answer | undefined;
  onChange: (answer: Answer) => void;
}

export function TextControl({ question, value, onChange }: TextControlProps) {
  const text = (value?.selected as string) ?? "";

  return (
    <textarea
      value={text}
      onChange={(e) => onChange({ selected: e.target.value, custom_text: "" })}
      placeholder={question.placeholder || ""}
      maxLength={question.max_length}
      className="w-full min-h-[80px] rounded-[var(--radius-sm)] border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-mute focus:outline-none focus:border-hairline-strong resize-y transition-colors"
    />
  );
}
