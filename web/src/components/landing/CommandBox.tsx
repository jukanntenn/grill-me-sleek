// CommandBox — a copy-to-clipboard command pill. Click copies, briefly
// confirms, then reverts. prompt defaults to "$"; pass "" for commands that
// belong to another surface (e.g. a Claude Code slash command).

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface CommandBoxProps {
  command: string;
  prompt?: string;
  testId?: string;
}

export function CommandBox({ command, prompt = "$", testId = "command-box" }: CommandBoxProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(command);
    } catch {
      // Clipboard unavailable (permissions / http) — still show feedback.
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      data-testid={testId}
      aria-label={`${t("landing.command.copy")}: ${command}`}
      className="border-hairline bg-canvas text-ink hover:border-hairline-strong flex h-12 items-center gap-[var(--spacing-sm)] rounded-[var(--radius-md)] border px-[var(--spacing-md)] font-mono text-sm transition-colors"
    >
      {prompt && <span className="text-mute select-none">{prompt}</span>}
      <span>{command}</span>
      <span className={`text-xs ${copied ? "text-success" : "text-mute"}`}>
        {copied ? `✓ ${t("landing.command.copied")}` : t("landing.command.copy")}
      </span>
    </button>
  );
}
