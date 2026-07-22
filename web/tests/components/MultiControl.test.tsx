import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MultiControl } from "../../src/components/MultiControl";
import type { Question } from "../../src/types";

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const baseQuestion: Question = {
  id: "q1",
  header: "Features",
  text: "Which features do you need?",
  type: "multi",
  options: [
    { label: "Feature A" },
    { label: "Feature B" },
    { label: "Feature C" },
  ],
  recommended: 1, // Feature B
};

describe("MultiControl", () => {
  it("renders all options", () => {
    const onChange = vi.fn();
    render(
      <MultiControl
        question={baseQuestion}
        value={{ selected: [], custom_text: "" }}
        onChange={onChange}
      />,
    );

    expect(screen.getByText("Feature A")).toBeInTheDocument();
    expect(screen.getByText("Feature B")).toBeInTheDocument();
    expect(screen.getByText("Feature C")).toBeInTheDocument();
  });

  it("shows recommended mark for recommended option", () => {
    const onChange = vi.fn();
    render(
      <MultiControl
        question={baseQuestion}
        value={{ selected: [], custom_text: "" }}
        onChange={onChange}
      />,
    );

    // Check that recommended mark is shown for Feature B
    const recommendedMark = screen.getByText("recommended");
    expect(recommendedMark).toBeInTheDocument();
  });

  it("selects option when clicked", () => {
    const onChange = vi.fn();
    render(
      <MultiControl
        question={baseQuestion}
        value={{ selected: [], custom_text: "" }}
        onChange={onChange}
      />,
    );

    // Click Feature A
    const featureAOption = screen.getByText("Feature A");
    fireEvent.click(featureAOption);

    // Check that onChange was called with Feature A selected
    expect(onChange).toHaveBeenCalledWith({
      selected: ["Feature A"],
      custom_text: "",
    });
  });

  it("deselects option when clicked again", () => {
    const onChange = vi.fn();
    render(
      <MultiControl
        question={baseQuestion}
        value={{ selected: ["Feature A"], custom_text: "" }}
        onChange={onChange}
      />,
    );

    // Click Feature A again to deselect
    const featureAOption = screen.getByText("Feature A");
    fireEvent.click(featureAOption);

    // Check that onChange was called with empty selected
    expect(onChange).toHaveBeenCalledWith({
      selected: [],
      custom_text: "",
    });
  });

  it("allows multiple selections", () => {
    const onChange = vi.fn();
    render(
      <MultiControl
        question={baseQuestion}
        value={{ selected: ["Feature A"], custom_text: "" }}
        onChange={onChange}
      />,
    );

    // Click Feature B to add to selection
    const featureBOption = screen.getByText("Feature B");
    fireEvent.click(featureBOption);

    // Check that onChange was called with both options selected
    expect(onChange).toHaveBeenCalledWith({
      selected: ["Feature A", "Feature B"],
      custom_text: "",
    });
  });

  it("renders custom text input when allow_custom_text is true", () => {
    const onChange = vi.fn();
    render(
      <MultiControl
        question={baseQuestion}
        value={{ selected: [], custom_text: "" }}
        onChange={onChange}
      />,
    );

    // Check that custom text input is rendered
    const customTextInput = screen.getByPlaceholderText("customTextPlaceholder");
    expect(customTextInput).toBeInTheDocument();
  });

  it("does not render custom text input when allow_custom_text is false", () => {
    const questionNoCustom = { ...baseQuestion, allow_custom_text: false };
    const onChange = vi.fn();
    render(
      <MultiControl
        question={questionNoCustom}
        value={{ selected: [], custom_text: "" }}
        onChange={onChange}
      />,
    );

    // Check that custom text input is not rendered
    const customTextInput = screen.queryByPlaceholderText("customTextPlaceholder");
    expect(customTextInput).not.toBeInTheDocument();
  });

  it("updates custom text when changed", () => {
    const onChange = vi.fn();
    render(
      <MultiControl
        question={baseQuestion}
        value={{ selected: [], custom_text: "Initial text" }}
        onChange={onChange}
      />,
    );

    // Find custom text input and change its value
    const customTextInput = screen.getByPlaceholderText("customTextPlaceholder");
    fireEvent.change(customTextInput, { target: { value: "New text" } });

    // Check that onChange was called with updated custom text
    expect(onChange).toHaveBeenCalledWith({
      selected: [],
      custom_text: "New text",
    });
  });
});
