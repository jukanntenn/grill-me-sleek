// Terminal page — completed/cancelled/expired/error/reconnect-failed.
//
// Vercel design: ex-empty-state-card (canvas-soft bg, rounded.lg, spacing.3xl padding,
// centered, stacked shadows). Migrated from app.ts:439-449 (renderTerminal).

interface TerminalPageProps {
  title: string;
  body: string;
}

export function TerminalPage({ title, body }: TerminalPageProps) {
  return (
    <div className="mt-[var(--spacing-xl)] rounded-[var(--radius-lg)] bg-canvas-soft px-[var(--spacing-3xl)] py-[var(--spacing-3xl)] text-center shadow-[var(--shadow-card)]">
      <h1 className="display-md text-ink">{title}</h1>
      <p className="mt-[var(--spacing-sm)] body-lg text-body">{body}</p>
    </div>
  );
}
