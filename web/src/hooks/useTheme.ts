// Theme management — light/dark/system (DESIGN.md §1076).
//
// Applies a `data-theme` attribute on <html>. "system" follows the OS via a
// matchMedia listener. Preference is persisted in localStorage.
// Migrated from the vanilla theme.ts; logic is equivalent.
//
// Dark theme uses polarity inversion of the Vercel ink↔canvas tokens
// (see globals.css [data-theme="dark"] block).

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

export const SUPPORTED_THEMES: Theme[] = ["light", "dark", "system"];

const STORAGE_KEY = "gs.theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function detectTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored && SUPPORTED_THEMES.includes(stored)) return stored;
  return "system";
}

function effectiveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
  }
  return theme;
}

function apply(theme: Theme) {
  document.documentElement.setAttribute("data-theme", effectiveTheme(theme));
}

/** Hook: returns current theme + setter. Applies the theme on mount and
 *  listens to OS changes when in "system" mode. */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(detectTheme);

  useEffect(() => {
    apply(theme);
  }, [theme]);

  useEffect(() => {
    const mql = window.matchMedia(MEDIA_QUERY);
    const handler = () => {
      if (theme === "system") apply("system");
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    if (!SUPPORTED_THEMES.includes(t)) return;
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  }, []);

  return { theme, setTheme, supportedThemes: SUPPORTED_THEMES };
}
