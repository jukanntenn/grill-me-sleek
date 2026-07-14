import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuestionCard } from "../../src/components/QuestionCard";
import type { Question } from "../../src/types";

// react-i18next mock — t() returns the key
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const baseQuestion: Question = {
  id: "q1",
  header: "What is your name?",
  text: "Please enter your full name.",
  type: "text",
};

describe("QuestionCard", () => {
  it("renders header and text", () => {
    render(
      <QuestionCard question={baseQuestion} error={undefined}>
        <textarea />
      </QuestionCard>,
    );
    expect(screen.getByText("What is your name?")).toBeInTheDocument();
    expect(screen.getByText("Please enter your full name.")).toBeInTheDocument();
  });

  it("shows required asterisk when required (default true)", () => {
    render(
      <QuestionCard question={baseQuestion}>
        <textarea />
      </QuestionCard>,
    );
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("hides required asterisk when required=false", () => {
    const q = { ...baseQuestion, required: false };
    render(
      <QuestionCard question={q}>
        <textarea />
      </QuestionCard>,
    );
    expect(screen.queryByText("*")).not.toBeInTheDocument();
  });

  it("shows error message when provided", () => {
    render(
      <QuestionCard question={baseQuestion} error="This field is required">
        <textarea />
      </QuestionCard>,
    );
    expect(screen.getByText("This field is required")).toBeInTheDocument();
  });

  it("shows recommended + explanation when both present", () => {
    const q: Question = { ...baseQuestion, recommended: 1, explanation: "Faster" };
    render(
      <QuestionCard question={q}>
        <textarea />
      </QuestionCard>,
    );
    expect(screen.getByText(/recommended/)).toBeInTheDocument();
    expect(screen.getByText(/Faster/)).toBeInTheDocument();
  });
});
