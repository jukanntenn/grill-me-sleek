// Controls bar — theme + language switcher (top-right).
//
// Vercel design: nav-cta style — rounded.sm 6px, hairline border, body-sm-strong text.
// Uses native <select> (simple, accessible, zero bundle cost for 2-4 options).
// Migrated from app.ts:387-426.

import { useTranslation } from "react-i18next";
import { useTheme, type Theme } from "../hooks/useTheme";
import { getLocale, setLocale, SUPPORTED_LOCALES, type Locale } from "../i18n";

export function Controls() {
  const { t } = useTranslation();
  const { theme, setTheme, supportedThemes } = useTheme();

  const themeKey = (th: Theme) =>
    ("theme" + th.charAt(0).toUpperCase() + th.slice(1)) as
      | "themeLight" | "themeDark" | "themeSystem";

  return (
    <div className="flex justify-end gap-2 mb-[var(--spacing-md)]">
      <select
        aria-label="theme"
        value={theme}
        onChange={(e) => setTheme(e.target.value as Theme)}
        className="h-7 rounded-[var(--radius-sm)] border border-hairline bg-canvas px-[var(--spacing-xs)] body-sm-strong text-ink cursor-pointer hover:border-hairline-strong transition-colors"
      >
        {supportedThemes.map((th) => (
          <option key={th} value={th}>
            {t(themeKey(th))}
          </option>
        ))}
      </select>

      <select
        aria-label={t("languageLabel")}
        value={getLocale()}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="h-7 rounded-[var(--radius-sm)] border border-hairline bg-canvas px-[var(--spacing-xs)] body-sm-strong text-ink cursor-pointer hover:border-hairline-strong transition-colors"
      >
        {SUPPORTED_LOCALES.map((loc) => (
          <option key={loc} value={loc}>
            {loc}
          </option>
        ))}
      </select>
    </div>
  );
}
