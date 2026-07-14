import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock the i18n + theme hooks with vi.fn so we can assert calls.
const setTheme = vi.fn();
const setLocale = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../../src/i18n", () => ({
  getLocale: () => "en",
  setLocale,
  SUPPORTED_LOCALES: ["en", "zh-CN", "zh-TW", "ja"],
}));
vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: "system",
    setTheme,
    supportedThemes: ["light", "dark", "system"],
  }),
}));

// Import after mocks are set up.
const { Controls } = await import("../../src/components/Controls");

describe("Controls", () => {
  it("renders theme and language selects", () => {
    render(<Controls />);
    expect(screen.getByLabelText("theme")).toBeInTheDocument();
    expect(screen.getByLabelText("languageLabel")).toBeInTheDocument();
  });

  it("theme select has all 3 options", () => {
    render(<Controls />);
    const themeSelect = screen.getByLabelText("theme") as HTMLSelectElement;
    expect(themeSelect.options.length).toBe(3);
    expect(Array.from(themeSelect.options).map((o) => o.value)).toEqual([
      "light",
      "dark",
      "system",
    ]);
  });

  it("language select has all 4 options", () => {
    render(<Controls />);
    const langSelect = screen.getByLabelText("languageLabel") as HTMLSelectElement;
    expect(langSelect.options.length).toBe(4);
    expect(Array.from(langSelect.options).map((o) => o.value)).toEqual([
      "en",
      "zh-CN",
      "zh-TW",
      "ja",
    ]);
  });

  it("changing theme select calls setTheme", () => {
    render(<Controls />);
    const themeSelect = screen.getByLabelText("theme");
    fireEvent.change(themeSelect, { target: { value: "dark" } });
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("changing language select calls setLocale", () => {
    render(<Controls />);
    const langSelect = screen.getByLabelText("languageLabel");
    fireEvent.change(langSelect, { target: { value: "ja" } });
    expect(setLocale).toHaveBeenCalledWith("ja");
  });
});
