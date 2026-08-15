// PillButton — the marketing CTA (DESIGN.md: 100px pill, button-primary /
// button-secondary). Renders an <a> when href is given, otherwise a <button>.

import type { ReactNode } from "react";

interface PillButtonProps {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  size?: "sm" | "lg";
}

export function PillButton({
  children,
  href,
  onClick,
  variant = "primary",
  size = "lg",
}: PillButtonProps) {
  const variantClass =
    variant === "primary"
      ? "bg-primary text-on-primary transition-opacity hover:opacity-90"
      : "border-hairline bg-canvas text-ink border transition-colors hover:border-hairline-strong";
  const sizeClass =
    size === "lg"
      ? "button-lg h-12 px-[var(--spacing-xl)]"
      : "button-md h-9 px-[var(--spacing-lg)]";
  const className = `inline-flex items-center justify-center whitespace-nowrap rounded-[var(--radius-pill)] ${variantClass} ${sizeClass}`;

  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}
