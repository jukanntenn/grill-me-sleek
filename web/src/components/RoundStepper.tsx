// RoundStepper — round history navigation shown above the page content.
//
// Answered rounds are clickable (review → revise); the current unanswered
// round is the active pill. Selecting a round delegates to the parent, which
// fetches it and transitions the state machine.

import { useTranslation } from "react-i18next";
import type { RoundSummaryData } from "../types";

interface RoundStepperProps {
  rounds: RoundSummaryData[];
  /** Latest round seq (the "current" marker). */
  currentRound: number;
  /** The round the user is currently viewing (review/revise), or the form round. */
  activeRound: number;
  onSelect: (round: number) => void;
}

export function RoundStepper({ rounds, currentRound, activeRound, onSelect }: RoundStepperProps) {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t("roundHistory")}
      className="mb-[var(--spacing-md)] flex flex-wrap items-center gap-[var(--spacing-xs)]"
      data-testid="round-stepper"
    >
      {rounds.map((r) => {
        const isCurrent = r.round === currentRound;
        const isActive = r.round === activeRound;
        const clickable = r.has_response || isCurrent;

        const base =
          "rounded-[var(--radius-pill)] border px-[var(--spacing-sm)] py-1 text-xs transition-colors";
        const stateClass = isActive
          ? "bg-primary text-on-primary border-transparent"
          : clickable
            ? "border-hairline bg-canvas text-body hover:border-hairline-strong cursor-pointer"
            : "border-hairline bg-canvas text-mute";

        const label = (
          <>
            {r.round === currentRound && <span className="mr-1">▶</span>}
            {t("roundN", { n: r.round })}
            {r.has_response && <span className="ml-1">✓</span>}
          </>
        );

        return clickable ? (
          <button
            key={r.round}
            type="button"
            data-testid={`stepper-round-${r.round}`}
            aria-current={isActive ? "step" : undefined}
            title={r.name ?? undefined}
            className={base + " " + stateClass}
            onClick={() => onSelect(r.round)}
          >
            {label}
          </button>
        ) : (
          <span
            key={r.round}
            data-testid={`stepper-round-${r.round}`}
            title={r.name ?? undefined}
            className={base + " " + stateClass}
          >
            {label}
          </span>
        );
      })}
    </nav>
  );
}
