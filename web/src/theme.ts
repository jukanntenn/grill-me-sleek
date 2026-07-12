// Theme — DESIGN.md §1076 (light / dark / system).
//
// Applies a `data-theme` attribute on <html>. "system" follows the OS via a
// matchMedia listener. Preference is persisted in localStorage.

export type Theme = "light" | "dark" | "system";

const SUPPORTED: Theme[] = ["light", "dark", "system"];
const STORAGE_KEY = "gs.theme";

let currentTheme: Theme = detectTheme();

function detectTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored && SUPPORTED.includes(stored)) return stored;
  return "system";
}

function effectiveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function apply() {
  document.documentElement.setAttribute("data-theme", effectiveTheme(currentTheme));
}

/** Install the theme + a listener so "system" tracks OS changes. Call once. */
export function initTheme() {
  apply();
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (currentTheme === "system") apply();
    });
}

export function getTheme(): Theme {
  return currentTheme;
}

export function setTheme(theme: Theme) {
  if (!SUPPORTED.includes(theme)) return;
  currentTheme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
  apply();
}

export const SUPPORTED_THEMES = SUPPORTED;
