import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuestionsPage } from "../../src/pages/QuestionsPage";
import type { RoundData } from "../../src/types";
import { z } from "zod";

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => {
    if (params) {
      return `${key} ${JSON.stringify(params)}`;
    }
    return key;
  }}),
}));

// Mock the schema validation with a valid Zod schema
vi.mock("../../src/lib/schemas", () => ({
  buildRoundSchema: () => z.object({}),
}));

const createMockRound = (roundNumber: number, name?: string): RoundData => ({
  round: roundNumber,
  name,
  grilling: {
    name: "Test Grilling",
    description: "Test description",
    questions: [
      {
        id: "q1",
        header: "Auth",
        text: "Which authentication scheme should we use?",
        type: "single",
        options: [
          { label: "JWT", description: "Stateless tokens" },
          { label: "Sessions", description: "Server-side sessions" },
          { label: "OAuth", description: "OAuth 2.0" },
        ],
        recommended: 0,
      },
      {
        id: "q2",
        header: "Features",
        text: "Which features do you need?",
        type: "multi",
        options: [
          { label: "Feature A" },
          { label: "Feature B" },
          { label: "Feature C" },
        ],
        recommended: 1,
      },
      {
        id: "q3",
        header: "Notes",
        text: "Any additional notes?",
        type: "text",
      },
    ],
  },
  response: null,
});

describe("QuestionsPage", () => {
  it("displays round number when name is not provided", () => {
    const round = createMockRound(1);
    const onSubmit = vi.fn();
    const onRetry = vi.fn();
    const onBanner = vi.fn();

    render(
      <QuestionsPage
        round={round}
        cachedValues={undefined}
        bannerMessage={null}
        onBanner={onBanner}
        onSubmit={onSubmit}
        onRetry={onRetry}
      />,
    );

    // Check that round number is displayed
    expect(screen.getByText(/round/)).toBeInTheDocument();
    expect(screen.getByText(/1/)).toBeInTheDocument();
  });

  it("displays round number with name when name is provided", () => {
    const round = createMockRound(1, "Auth approach");
    const onSubmit = vi.fn();
    const onRetry = vi.fn();
    const onBanner = vi.fn();

    render(
      <QuestionsPage
        round={round}
        cachedValues={undefined}
        bannerMessage={null}
        onBanner={onBanner}
        onSubmit={onSubmit}
        onRetry={onRetry}
      />,
    );

    // Check that round number and name are displayed
    expect(screen.getByText(/round/)).toBeInTheDocument();
    expect(screen.getByText(/1/)).toBeInTheDocument();
    expect(screen.getByText(/Auth approach/)).toBeInTheDocument();
  });

  it("displays round indicator above grilling name", () => {
    const round = createMockRound(1, "Auth approach");
    const onSubmit = vi.fn();
    const onRetry = vi.fn();
    const onBanner = vi.fn();

    render(
      <QuestionsPage
        round={round}
        cachedValues={undefined}
        bannerMessage={null}
        onBanner={onBanner}
        onSubmit={onSubmit}
        onRetry={onRetry}
      />,
    );

    // Check that round indicator appears before grilling name
    const roundIndicator = screen.getByText(/round/);
    const grillingName = screen.getByText("Test Grilling");

    // Round indicator should be in the DOM before grilling name
    expect(roundIndicator.compareDocumentPosition(grillingName)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("auto-selects recommended options when no cache", () => {
    const round = createMockRound(1);
    const onSubmit = vi.fn();
    const onRetry = vi.fn();
    const onBanner = vi.fn();

    render(
      <QuestionsPage
        round={round}
        cachedValues={undefined}
        bannerMessage={null}
        onBanner={onBanner}
        onSubmit={onSubmit}
        onRetry={onRetry}
      />,
    );

    // Check that recommended option is selected for single choice
    const jwtOption = screen.getByText("JWT");
    const jwtLabel = jwtOption.closest("label");
    expect(jwtLabel).toHaveAttribute("data-selected", "true");

    // Check that recommended option is selected for multi choice
    const featureBOption = screen.getByText("Feature B");
    const featureBLabel = featureBOption.closest("label");
    expect(featureBLabel).toHaveAttribute("data-selected", "true");
  });

  it("uses cached values when provided", () => {
    const round = createMockRound(1);
    const cachedValues = {
      q1: { selected: "Sessions", custom_text: "" },
      q2: { selected: ["Feature A"], custom_text: "" },
      q3: { selected: "Cached note", custom_text: "" },
    };
    const onSubmit = vi.fn();
    const onRetry = vi.fn();
    const onBanner = vi.fn();

    render(
      <QuestionsPage
        round={round}
        cachedValues={cachedValues}
        bannerMessage={null}
        onBanner={onBanner}
        onSubmit={onSubmit}
        onRetry={onRetry}
      />,
    );

    // Check that cached values are used instead of recommended
    const sessionsOption = screen.getByText("Sessions");
    const sessionsLabel = sessionsOption.closest("label");
    expect(sessionsLabel).toHaveAttribute("data-selected", "true");

    const featureAOption = screen.getByText("Feature A");
    const featureALabel = featureAOption.closest("label");
    expect(featureALabel).toHaveAttribute("data-selected", "true");

    // Check that text field has cached value
    const notesField = screen.getByDisplayValue("Cached note");
    expect(notesField).toHaveValue("Cached note");
  });

  it("renders all question types", () => {
    const round = createMockRound(1);
    const onSubmit = vi.fn();
    const onRetry = vi.fn();
    const onBanner = vi.fn();

    render(
      <QuestionsPage
        round={round}
        cachedValues={undefined}
        bannerMessage={null}
        onBanner={onBanner}
        onSubmit={onSubmit}
        onRetry={onRetry}
      />,
    );

    // Check that all question headers are rendered
    expect(screen.getByText("Auth")).toBeInTheDocument();
    expect(screen.getByText("Features")).toBeInTheDocument();
    expect(screen.getByText("Notes")).toBeInTheDocument();

    // Check that question texts are rendered
    expect(screen.getByText("Which authentication scheme should we use?")).toBeInTheDocument();
    expect(screen.getByText("Which features do you need?")).toBeInTheDocument();
    expect(screen.getByText("Any additional notes?")).toBeInTheDocument();
  });

  it("displays banner message when provided", () => {
    const round = createMockRound(1);
    const onSubmit = vi.fn();
    const onRetry = vi.fn();
    const onBanner = vi.fn();

    render(
      <QuestionsPage
        round={round}
        cachedValues={undefined}
        bannerMessage="Network error"
        onBanner={onBanner}
        onSubmit={onSubmit}
        onRetry={onRetry}
      />,
    );

    // Check that banner message is displayed
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });

  it("renders submit button", () => {
    const round = createMockRound(1);
    const onSubmit = vi.fn();
    const onRetry = vi.fn();
    const onBanner = vi.fn();

    render(
      <QuestionsPage
        round={round}
        cachedValues={undefined}
        bannerMessage={null}
        onBanner={onBanner}
        onSubmit={onSubmit}
        onRetry={onRetry}
      />,
    );

    // Check that submit button is rendered
    const submitButton = screen.getByRole("button", { name: "submit" });
    expect(submitButton).toBeInTheDocument();
  });
});
