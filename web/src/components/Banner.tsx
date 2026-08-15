// Error banner with retry button.
//
// Vercel design: ex-toast shape (rounded.md) + error-soft background + error-deep border,
// stacked shadows. padding: spacing.sm spacing.md.
// Migrated from app.ts:865-892.

interface BannerProps {
  message: string;
  onRetry: () => void;
  retryLabel: string;
}

export function Banner({ message, onRetry, retryLabel }: BannerProps) {
  return (
    <div
      className="border-error-deep bg-error-soft mb-[var(--spacing-md)] flex items-center justify-between gap-3 rounded-[var(--radius-md)] border px-[var(--spacing-md)] py-[var(--spacing-sm)] shadow-[var(--shadow-toast)]"
      role="alert"
    >
      <span className="text-error-deep text-sm">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="text-error-deep hover:bg-error-soft shrink-0 rounded-[var(--radius-sm)] bg-white px-3 py-1.5 text-sm font-medium transition-colors"
      >
        {retryLabel}
      </button>
    </div>
  );
}
