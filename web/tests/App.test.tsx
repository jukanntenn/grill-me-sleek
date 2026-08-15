import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../src/App";
import { fetchCurrent } from "../src/lib/api";

// react-i18next mock — t() returns the key
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// Controls pulls in the real i18n index — stub it out
// (useTheme needs window.matchMedia, which jsdom lacks).
vi.mock("../src/i18n", () => ({
  getLocale: () => "en",
  setLocale: vi.fn(),
  SUPPORTED_LOCALES: ["en", "zh-CN", "zh-TW", "ja"],
}));
vi.mock("../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: "system",
    setTheme: vi.fn(),
    supportedThemes: ["light", "dark", "system"],
  }),
}));

// SSE/submit are session-flow machinery — irrelevant to the routing branch.
vi.mock("../src/hooks/useSSE", () => ({
  useSSE: () => {},
}));
vi.mock("../src/hooks/useSubmit", () => ({
  useSubmit: () => ({ submit: vi.fn(), retry: vi.fn() }),
}));
vi.mock("../src/lib/api", () => ({
  fetchCurrent: vi.fn(),
}));

const mockFetch = vi.mocked(fetchCurrent);

describe("App root branch (session hash presence)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    window.location.hash = "";
  });

  it("renders the landing page when there is no session hash", () => {
    render(<App />);
    expect(screen.getByText("landing.hero.title")).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("renders the session flow when a hash is present", async () => {
    mockFetch.mockResolvedValue({ ok: false, kind: "not-found" } as never);
    window.location.hash = "#sess-123";
    render(<App />);
    expect(screen.queryByText("landing.hero.title")).not.toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith("sess-123");
    // not-found resolves into the error terminal page (title echoed as body)
    expect((await screen.findAllByText("errorNotFound")).length).toBeGreaterThan(0);
  });
});
