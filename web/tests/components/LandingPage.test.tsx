import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LandingPage } from "../../src/pages/LandingPage";

// react-i18next mock — t() returns the key
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// LandingNav pulls in the real i18n index via Controls — stub it out
// (useTheme needs window.matchMedia, which jsdom lacks).
vi.mock("../../src/i18n", () => ({
  getLocale: () => "en",
  setLocale: vi.fn(),
  SUPPORTED_LOCALES: ["en", "zh-CN", "zh-TW", "ja"],
}));
vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: "system",
    setTheme: vi.fn(),
    supportedThemes: ["light", "dark", "system"],
  }),
}));

describe("LandingPage", () => {
  it("renders every section of the grilling narrative", () => {
    render(<LandingPage />);
    // hero
    expect(screen.getByText("landing.hero.title")).toBeInTheDocument();
    expect(screen.getByText("landing.hero.kicker")).toBeInTheDocument();
    // §1–§5 section questions
    expect(screen.getByText("landing.s1.title")).toBeInTheDocument();
    expect(screen.getByText("landing.s2.title")).toBeInTheDocument();
    expect(screen.getByText("landing.s3.title")).toBeInTheDocument();
    expect(screen.getByText("landing.s4.title")).toBeInTheDocument();
    expect(screen.getByText("landing.s5.title")).toBeInTheDocument();
  });

  it("shows the wordmark in nav and footer", () => {
    render(<LandingPage />);
    expect(screen.getAllByText("grill-me-sleek").length).toBe(2);
  });

  it("shows the install command in hero and final CTA", () => {
    render(<LandingPage />);
    const boxes = screen.getAllByText("npx @grilling-sleek/cli");
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    // Claude Code plugin command in the final CTA
    expect(
      screen.getByText("/plugin marketplace add jukanntenn/grill-me-sleek"),
    ).toBeInTheDocument();
  });

  it("renders the hero question card and the live demo round", () => {
    render(<LandingPage />);
    // hero static preview
    expect(screen.getByText("Which authentication scheme should we use?")).toBeInTheDocument();
    // §4 live demo questions
    expect(screen.getByText("Where do refresh tokens live?")).toBeInTheDocument();
    expect(
      screen.getByText("Migrate everything at once, or service by service?"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "submit" })).toBeInTheDocument();
  });

  it("marks the product as the recommended review option (§3)", () => {
    render(<LandingPage />);
    expect(screen.getByText("landing.s3.opt3Label")).toBeInTheDocument();
    expect(screen.getAllByText("recommended").length).toBeGreaterThan(0);
  });
});
