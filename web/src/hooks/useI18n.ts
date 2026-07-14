// Thin wrapper over react-i18next's useTranslation, exposing the locale
// helpers for the Controls component (theme/language switcher).

import { useTranslation } from "react-i18next";
import { getLocale, setLocale, SUPPORTED_LOCALES, type Locale } from "../i18n";

export function useI18n() {
  const { t } = useTranslation();
  return {
    t,
    locale: getLocale(),
    setLocale,
    supportedLocales: SUPPORTED_LOCALES as readonly Locale[],
  };
}
