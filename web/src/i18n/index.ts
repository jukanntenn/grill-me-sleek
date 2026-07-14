// react-i18next initialization.
//
// Language detection order: localStorage("gs.locale") → navigator.language → "en".
// Replaces the hand-written i18n.ts (DESIGN.md §1076: en/zh-CN/zh-TW/ja).

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import ja from "./locales/ja.json";

export type Locale = "en" | "zh-CN" | "zh-TW" | "ja";

export const SUPPORTED_LOCALES: Locale[] = ["en", "zh-CN", "zh-TW", "ja"];

const STORAGE_KEY = "gs.locale";

function detectLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (stored && SUPPORTED_LOCALES.includes(stored)) return stored;
  const nav = navigator.language.toLowerCase();
  if (nav.startsWith("zh")) {
    return nav.includes("tw") || nav.includes("hant") ? "zh-TW" : "zh-CN";
  }
  if (nav.startsWith("ja")) return "ja";
  return "en";
}

function applyHtmlLang(locale: Locale) {
  document.documentElement.lang = locale;
}

const resources = {
  en: { translation: en },
  "zh-CN": { translation: zhCN },
  "zh-TW": { translation: zhTW },
  ja: { translation: ja },
};

const initialLocale = detectLocale();

i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale,
  fallbackLng: "en",
  interpolation: {
    // React already escapes by default, no need for i18next to escape.
    escapeValue: false,
  },
});

applyHtmlLang(initialLocale);

// Keep <html lang> in sync when language changes.
i18n.on("languageChanged", (lng: string) => {
  applyHtmlLang(lng as Locale);
});

export function getLocale(): Locale {
  return i18n.language as Locale;
}

export function setLocale(locale: Locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  localStorage.setItem(STORAGE_KEY, locale);
  void i18n.changeLanguage(locale);
}

export default i18n;
