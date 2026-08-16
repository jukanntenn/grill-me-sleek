import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReviewRoundPage } from "../../src/pages/ReviewRoundPage";
import type { RoundData } from "../../src/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  }),
}));

const answeredRound: RoundData = {
  round: 1,
  name: "Auth",
  grilling: {
    name: "Plan",
    questions: [
      {
        id: "q1",
        header: "Auth",
        text: "Which auth?",
        type: "single",
        options: [{ label: "JWT" }, { label: "Sessions" }],
      },
      {
        id: "q2",
        header: "Scope",
        text: "Which parts?",
        type: "multi",
        options: [{ label: "API" }, { label: "Web" }],
      },
    ],
  },
  response: {
    round: 1,
    answers: {
      q1: { selected: "JWT", custom_text: "if possible" },
      q2: { selected: ["API", "Web"] },
    },
    additional_notes: "watch out for token rotation",
    submitted_at: "2026-08-16T00:00:00Z",
    revision: 3,
  },
};

describe("ReviewRoundPage", () => {
  it("shows each question with the submitted answer", () => {
    render(<ReviewRoundPage round={answeredRound} onRevise={() => {}} onBack={() => {}} />);
    expect(screen.getByTestId("review-question-q1")).toHaveTextContent("JWT");
    expect(screen.getByTestId("review-question-q1")).toHaveTextContent("if possible");
    expect(screen.getByTestId("review-question-q2")).toHaveTextContent("API");
    expect(screen.getByTestId("review-question-q2")).toHaveTextContent("Web");
    expect(screen.getByTestId("review-notes")).toHaveTextContent("token rotation");
  });

  it("shows the revision count (revision minus the original)", () => {
    render(<ReviewRoundPage round={answeredRound} onRevise={() => {}} onBack={() => {}} />);
    expect(screen.getByTestId("review-status")).toHaveTextContent("revisedTimes");
    expect(screen.getByTestId("review-status")).toHaveTextContent("2");
  });

  it("does not show a revision count when never revised", () => {
    const once: RoundData = {
      ...answeredRound,
      response: { ...answeredRound.response!, revision: 1 },
    };
    render(<ReviewRoundPage round={once} onRevise={() => {}} onBack={() => {}} />);
    expect(screen.getByTestId("review-status")).not.toHaveTextContent("revisedTimes");
  });

  it("revise and back buttons invoke their callbacks", () => {
    const onRevise = vi.fn();
    const onBack = vi.fn();
    render(<ReviewRoundPage round={answeredRound} onRevise={onRevise} onBack={onBack} />);
    fireEvent.click(screen.getByTestId("revise-button"));
    expect(onRevise).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("back-to-current"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
