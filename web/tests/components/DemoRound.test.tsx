import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DemoRound } from "../../src/components/landing/DemoRound";

// react-i18next mock — t() returns the key
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const selectedState = (label: string) => screen.getByText(label).closest("label")?.dataset.selected;

describe("DemoRound", () => {
  it("pre-selects the recommended answers", () => {
    render(<DemoRound />);
    expect(selectedState("Redis")).toBe("true");
    expect(selectedState("Postgres")).toBe("false");
    expect(selectedState("Service by service")).toBe("true");
  });

  it("lets the visitor change an answer", () => {
    render(<DemoRound />);
    fireEvent.click(screen.getByText("Postgres"));
    expect(selectedState("Postgres")).toBe("true");
    expect(selectedState("Redis")).toBe("false");
  });

  it("flips into the receipt card on submit", () => {
    render(<DemoRound />);
    fireEvent.click(screen.getByRole("button", { name: "submit" }));
    expect(screen.getByTestId("demo-receipt")).toBeInTheDocument();
    expect(screen.getByText(/landing\.s4\.receiptTitle/)).toBeInTheDocument();
    expect(screen.getByText("npx @grilling-sleek/cli")).toBeInTheDocument();
    // the form is gone
    expect(screen.queryByText("Where do refresh tokens live?")).not.toBeInTheDocument();
  });

  it("resets the round via the again button", () => {
    render(<DemoRound />);
    fireEvent.click(screen.getByRole("button", { name: "submit" }));
    fireEvent.click(screen.getByText("landing.s4.again"));
    expect(screen.getByText("Where do refresh tokens live?")).toBeInTheDocument();
    // answers reset to recommended
    expect(selectedState("Redis")).toBe("true");
    expect(selectedState("Postgres")).toBe("false");
  });
});
