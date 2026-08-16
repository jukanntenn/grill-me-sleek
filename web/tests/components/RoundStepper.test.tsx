import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RoundStepper } from "../../src/components/RoundStepper";
import type { RoundSummaryData } from "../../src/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  }),
}));

const rounds: RoundSummaryData[] = [
  { round: 1, name: "Auth", has_response: true, revision: 2 },
  { round: 2, name: "Storage", has_response: true, revision: 1 },
  { round: 3, name: "Deploy", has_response: false, revision: 1 },
];

describe("RoundStepper", () => {
  it("renders one pill per round with answered marks", () => {
    render(<RoundStepper rounds={rounds} currentRound={3} activeRound={3} onSelect={() => {}} />);
    expect(screen.getByTestId("stepper-round-1")).toHaveTextContent("✓");
    expect(screen.getByTestId("stepper-round-2")).toHaveTextContent("✓");
    expect(screen.getByTestId("stepper-round-3")).toHaveTextContent("▶");
  });

  it("answered rounds and the current round are clickable; future-unanswered are not", () => {
    const onSelect = vi.fn();
    render(<RoundStepper rounds={rounds} currentRound={3} activeRound={3} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("stepper-round-1"));
    expect(onSelect).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByTestId("stepper-round-3"));
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("marks the active round as the current step", () => {
    render(<RoundStepper rounds={rounds} currentRound={3} activeRound={1} onSelect={() => {}} />);
    expect(screen.getByTestId("stepper-round-1")).toHaveAttribute("aria-current", "step");
    expect(screen.getByTestId("stepper-round-3")).not.toHaveAttribute("aria-current");
  });
});
