// QuestionsPage revise mode: prefills the submitted response and swaps the
// CTA to the update label. Mirrors the mocks used by QuestionsPage.test.tsx.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuestionsPage } from "../../src/pages/QuestionsPage";
import type { RoundData } from "../../src/types";
import { z } from "zod";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  }),
}));

vi.mock("../../src/lib/schemas", () => ({
  buildRoundSchema: () => z.object({}),
}));

const answeredRound: RoundData = {
  round: 1,
  name: "Auth",
  grilling: {
    name: "Plan",
    additional_notes: {},
    questions: [
      {
        id: "q1",
        header: "Auth",
        text: "Which auth?",
        type: "single",
        options: [{ label: "JWT" }, { label: "Sessions" }],
      },
    ],
  },
  response: {
    round: 1,
    answers: { q1: { selected: "JWT" } },
    additional_notes: "prior note",
    submitted_at: "2026-08-16T00:00:00Z",
    revision: 1,
  },
};

describe("QuestionsPage (revise mode)", () => {
  it("labels the CTA updateAnswer and exposes the revise testid", () => {
    render(
      <QuestionsPage
        round={answeredRound}
        cachedValues={answeredRound.response!.answers}
        cachedNotes={answeredRound.response!.additional_notes}
        mode="revise"
        bannerMessage={null}
        onBanner={() => {}}
        onSubmit={() => {}}
        onRetry={() => {}}
      />,
    );
    const cta = screen.getByTestId("revise-submit");
    expect(cta).toHaveTextContent("updateAnswer");
    expect(screen.queryByTestId("submit")).toBeNull();
  });

  it("prefills the submitted selection and notes", () => {
    render(
      <QuestionsPage
        round={answeredRound}
        cachedValues={answeredRound.response!.answers}
        cachedNotes={answeredRound.response!.additional_notes}
        mode="revise"
        bannerMessage={null}
        onBanner={() => {}}
        onSubmit={() => {}}
        onRetry={() => {}}
      />,
    );
    // The submitted "JWT" option carries the selected state.
    const selected = screen.getAllByText("JWT").find((el) => el.closest('[data-selected="true"]'));
    expect(selected).toBeTruthy();
    expect(
      (screen.getByTestId("additional-notes").querySelector("textarea") as HTMLTextAreaElement)
        .value,
    ).toBe("prior note");
  });
});
