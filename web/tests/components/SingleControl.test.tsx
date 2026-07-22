import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SingleControl } from "../../src/components/SingleControl";
import type { Question } from "../../src/types";

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const baseQuestion: Question = {
  id: "q1",
  header: "Auth",
  text: "Which authentication scheme should we use?",
  type: "single",
  options: [
    { label: "JWT, stateless", description: "Signed tokens; no server session store." },
    { label: "Server sessions", description: "Opaque session ID in a DB/Redis." },
    { label: "OAuth 2.0 / OIDC", description: "Delegate to an IdP." },
  ],
  recommended: 0,
};

describe("SingleControl", () => {
  it("renders all options including 'None of the above' for optional questions", () => {
    const optionalQuestion = { ...baseQuestion, required: false };
    const onChange = vi.fn();
    render(
      <SingleControl
        question={optionalQuestion}
        value={{ selected: "", custom_text: "" }}
        onChange={onChange}
      />,
    );

    // Check that all options are rendered
    expect(screen.getByText("JWT, stateless")).toBeInTheDocument();
    expect(screen.getByText("Server sessions")).toBeInTheDocument();
    expect(screen.getByText("OAuth 2.0 / OIDC")).toBeInTheDocument();

    // Check that "None of the above" option is rendered for optional questions
    expect(screen.getByText("noSelection")).toBeInTheDocument();
  });

  it("does not render 'None of the above' for required questions", () => {
    const onChange = vi.fn();
    render(
      <SingleControl
        question={baseQuestion}
        value={{ selected: "", custom_text: "" }}
        onChange={onChange}
      />,
    );

    // Check that "None of the above" option is NOT rendered for required questions
    expect(screen.queryByText("noSelection")).not.toBeInTheDocument();
  });

  it("selects 'None of the above' when clicked", () => {
    const optionalQuestion = { ...baseQuestion, required: false };
    const onChange = vi.fn();
    render(
      <SingleControl
        question={optionalQuestion}
        value={{ selected: "JWT, stateless", custom_text: "" }}
        onChange={onChange}
      />,
    );

    // Click "None of the above" option
    const noneOption = screen.getByText("noSelection");
    fireEvent.click(noneOption);

    // Check that onChange was called with empty selected
    expect(onChange).toHaveBeenCalledWith({
      selected: "",
      custom_text: "",
    });
  });

  it("shows recommended mark for recommended option", () => {
    const onChange = vi.fn();
    render(
      <SingleControl
        question={baseQuestion}
        value={{ selected: "", custom_text: "" }}
        onChange={onChange}
      />,
    );

    // Check that recommended mark is shown for the first option
    const recommendedMark = screen.getByText("recommended");
    expect(recommendedMark).toBeInTheDocument();
  });

  it("renders yesno variant correctly", () => {
    const yesnoQuestion: Question = {
      id: "q2",
      header: "Yes/No",
      text: "Do you agree?",
      type: "single",
      variant: "yesno",
      recommended: 1, // yes
    };

    const onChange = vi.fn();
    render(
      <SingleControl
        question={yesnoQuestion}
        value={{ selected: "", custom_text: "" }}
        onChange={onChange}
      />,
    );

    // Check that Yes and No buttons are rendered
    expect(screen.getByText("yes")).toBeInTheDocument();
    expect(screen.getByText("no")).toBeInTheDocument();

    // Check that recommended mark is shown for Yes
    const recommendedMark = screen.getByText("(recommended)");
    expect(recommendedMark).toBeInTheDocument();
  });

  it("renders rating variant correctly", () => {
    const ratingQuestion: Question = {
      id: "q3",
      header: "Rating",
      text: "How would you rate this?",
      type: "single",
      variant: "rating",
      rating_max: 5,
      recommended: 3,
    };

    const onChange = vi.fn();
    render(
      <SingleControl
        question={ratingQuestion}
        value={{ selected: "", custom_text: "" }}
        onChange={onChange}
      />,
    );

    // Check that rating numbers 1-5 are rendered
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(String(i))).toBeInTheDocument();
    }

    // Check that recommended mark is shown for rating 3
    const recommendedMark = screen.getByText("(recommended)");
    expect(recommendedMark).toBeInTheDocument();
  });

  it("does not render 'None of the above' for yesno variant", () => {
    const yesnoQuestion: Question = {
      id: "q4",
      header: "Yes/No",
      text: "Do you agree?",
      type: "single",
      variant: "yesno",
    };

    const onChange = vi.fn();
    render(
      <SingleControl
        question={yesnoQuestion}
        value={{ selected: "", custom_text: "" }}
        onChange={onChange}
      />,
    );

    // Check that "None of the above" is not rendered for yesno variant
    expect(screen.queryByText("noSelection")).not.toBeInTheDocument();
  });

  it("does not render 'None of the above' for rating variant", () => {
    const ratingQuestion: Question = {
      id: "q5",
      header: "Rating",
      text: "How would you rate this?",
      type: "single",
      variant: "rating",
      rating_max: 5,
    };

    const onChange = vi.fn();
    render(
      <SingleControl
        question={ratingQuestion}
        value={{ selected: "", custom_text: "" }}
        onChange={onChange}
      />,
    );

    // Check that "None of the above" is not rendered for rating variant
    expect(screen.queryByText("noSelection")).not.toBeInTheDocument();
  });
});
