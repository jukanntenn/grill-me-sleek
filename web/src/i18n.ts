// i18n — DESIGN.md §1076 (en / zh-CN / zh-TW / ja).
//
// All user-facing strings live here so the rendering code never hardcodes
// text. Language is detected from navigator.language (first matching prefix),
// overridable and persisted in localStorage. <html lang> is kept in sync.

export type Locale = "en" | "zh-CN" | "zh-TW" | "ja";

const SUPPORTED: Locale[] = ["en", "zh-CN", "zh-TW", "ja"];
const STORAGE_KEY = "gs.locale";

/** Dictionary keys — every render path must go through `t()`. */
export type MessageKey =
  | "loading"
  | "submit"
  | "retry"
  | "waitingNextRound"
  | "reconnecting"
  | "reconnectFailed"
  | "completed"
  | "completedBody"
  | "cancelled"
  | "expired"
  | "errorInvalidLink"
  | "errorNotFound"
  | "errorSessionEnded"
  | "connectionLost"
  | "recommended"
  | "yes"
  | "no"
  | "customTextPlaceholder"
  | "additionalNotesDefault"
  | "errSelectOne"
  | "errYesNo"
  | "errSelectRating"
  | "errMultiMin"
  | "errTextRequired"
  | "errTextTooLong"
  | "errNotesRequired"
  | "errNotesTooLong"
  | "bannerSubmitFailed"
  | "bannerNetworkError"
  | "bannerServerError"
  | "confirmSwitchRound"
  | "themeLight"
  | "themeDark"
  | "themeSystem"
  | "languageLabel";

type Dict = Record<MessageKey, string>;

const en: Dict = {
  loading: "Loading…",
  submit: "Submit",
  retry: "Retry",
  waitingNextRound: "Waiting for the next round…",
  reconnecting: "Reconnecting (attempt {n})…",
  reconnectFailed: "Could not reconnect. Please refresh the page.",
  completed: "Session completed",
  completedBody: "Thank you for your answers!",
  cancelled: "Session cancelled",
  expired: "Session expired",
  errorInvalidLink: "Invalid link. Please contact the sender.",
  errorNotFound: "Session not found.",
  errorSessionEnded: "This session has ended.",
  connectionLost: "Connection lost",
  recommended: "Recommended",
  yes: "Yes",
  no: "No",
  customTextPlaceholder: "Additional notes (optional)",
  additionalNotesDefault: "Additional notes",
  errSelectOne: "{h}: please select one option",
  errYesNo: "{h}: please choose Yes or No",
  errSelectRating: "{h}: please select a rating",
  errMultiMin: "{h}: select at least one",
  errTextRequired: "{h}: this field is required",
  errTextTooLong: "{h}: exceeds max length {n}",
  errNotesRequired: "Please fill in the additional notes",
  errNotesTooLong: "Additional notes exceed max length {n}",
  bannerSubmitFailed: "Submission failed. Click retry.",
  bannerNetworkError: "Network error. Click retry.",
  bannerServerError: "Server error ({n}). Click retry.",
  confirmSwitchRound:
    "Session has moved to round {n}. Switch? (Your current answers are saved in memory.)",
  themeLight: "Light",
  themeDark: "Dark",
  themeSystem: "System",
  languageLabel: "Language",
};

const zhCN: Dict = {
  loading: "加载中…",
  submit: "提交",
  retry: "重试",
  waitingNextRound: "等待下一轮…",
  reconnecting: "重新连接中（第 {n} 次）…",
  reconnectFailed: "无法重新连接，请刷新页面。",
  completed: "会话已完成",
  completedBody: "感谢您的作答！",
  cancelled: "会话已取消",
  expired: "会话已过期",
  errorInvalidLink: "无效链接，请联系发起者。",
  errorNotFound: "会话不存在。",
  errorSessionEnded: "此会话已结束。",
  connectionLost: "连接丢失",
  recommended: "推荐",
  yes: "是",
  no: "否",
  customTextPlaceholder: "补充说明（可选）",
  additionalNotesDefault: "补充说明",
  errSelectOne: "{h}：请选择一个选项",
  errYesNo: "{h}：请选择是或否",
  errSelectRating: "{h}：请选择评分",
  errMultiMin: "{h}：至少选择一项",
  errTextRequired: "{h}：此题为必填",
  errTextTooLong: "{h}：超过最大长度 {n}",
  errNotesRequired: "请填写补充说明",
  errNotesTooLong: "补充说明超过最大长度 {n}",
  bannerSubmitFailed: "提交失败，点击重试。",
  bannerNetworkError: "网络错误，点击重试。",
  bannerServerError: "服务器错误（{n}），点击重试。",
  confirmSwitchRound: "会话已推进到第 {n} 轮，是否切换？（当前未提交的作答已暂存在内存。）",
  themeLight: "浅色",
  themeDark: "深色",
  themeSystem: "跟随系统",
  languageLabel: "语言",
};

const zhTW: Dict = {
  ...zhCN,
  loading: "載入中…",
  waitingNextRound: "等待下一輪…",
  reconnecting: "重新連線中（第 {n} 次）…",
  reconnectFailed: "無法重新連線，請重新整理頁面。",
  completed: "工作階段已完成",
  completedBody: "感謝您的作答！",
  cancelled: "工作階段已取消",
  expired: "工作階段已過期",
  errorInvalidLink: "無效連結，請聯絡發起者。",
  errorNotFound: "工作階段不存在。",
  errorSessionEnded: "此工作階段已結束。",
  connectionLost: "連線遺失",
  submit: "提交",
  retry: "重試",
  errSelectOne: "{h}：請選擇一個選項",
  errYesNo: "{h}：請選擇是或否",
  errSelectRating: "{h}：請選擇評分",
  errMultiMin: "{h}：至少選擇一項",
  errTextRequired: "{h}：此題為必填",
  errTextTooLong: "{h}：超過最大長度 {n}",
  bannerSubmitFailed: "提交失敗，點擊重試。",
  bannerNetworkError: "網路錯誤，點擊重試。",
  bannerServerError: "伺服器錯誤（{n}），點擊重試。",
  confirmSwitchRound: "工作階段已推進到第 {n} 輪，是否切換？（目前未提交的作答已暫存在記憶體。）",
  themeLight: "淺色",
  themeDark: "深色",
  themeSystem: "跟隨系統",
  languageLabel: "語言",
};

const ja: Dict = {
  loading: "読み込み中…",
  submit: "送信",
  retry: "再試行",
  waitingNextRound: "次のラウンドを待っています…",
  reconnecting: "再接続中（{n} 回目）…",
  reconnectFailed: "再接続できませんでした。ページを再読み込みしてください。",
  completed: "セッション完了",
  completedBody: "ご回答ありがとうございます！",
  cancelled: "セッションはキャンセルされました",
  expired: "セッションは期限切れです",
  errorInvalidLink: "無効なリンクです。送信者にお問い合わせください。",
  errorNotFound: "セッションが見つかりません。",
  errorSessionEnded: "このセッションは終了しました。",
  connectionLost: "接続が失われました",
  recommended: "推奨",
  yes: "はい",
  no: "いいえ",
  customTextPlaceholder: "補足メモ（任意）",
  additionalNotesDefault: "補足メモ",
  errSelectOne: "{h}：選択してください",
  errYesNo: "{h}：はい／いいえを選択してください",
  errSelectRating: "{h}：評価を選択してください",
  errMultiMin: "{h}：少なくとも一つ選択してください",
  errTextRequired: "{h}：この項目は必須です",
  errTextTooLong: "{h}：最大文字数 {n} を超えています",
  errNotesRequired: "補足メモを入力してください",
  errNotesTooLong: "補足メモが最大文字数 {n} を超えています",
  bannerSubmitFailed: "送信に失敗しました。再試行してください。",
  bannerNetworkError: "ネットワークエラー。再試行してください。",
  bannerServerError: "サーバーエラー（{n}）。再試行してください。",
  confirmSwitchRound:
    "セッションが第 {n} ラウンドに進みました。切り替えますか？（現在の未送信回答はメモリに保存されます。）",
  themeLight: "ライト",
  themeDark: "ダーク",
  themeSystem: "システム",
  languageLabel: "言語",
};

const DICTS: Record<Locale, Dict> = {
  en,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  ja,
};

let currentLocale: Locale = detectLocale();

function detectLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (stored && SUPPORTED.includes(stored)) return stored;
  const nav = navigator.language.toLowerCase();
  if (nav.startsWith("zh")) {
    return nav.includes("tw") || nav.includes("hant") ? "zh-TW" : "zh-CN";
  }
  if (nav.startsWith("ja")) return "ja";
  return "en";
}

function applyHtmlLang() {
  document.documentElement.lang = currentLocale;
}

/** Translate a message key with optional {placeholder} substitutions. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let s = DICTS[currentLocale][key] ?? DICTS.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(`{${k}}`, String(v));
    }
  }
  return s;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale) {
  if (!SUPPORTED.includes(locale)) return;
  currentLocale = locale;
  localStorage.setItem(STORAGE_KEY, locale);
  applyHtmlLang();
}

export const SUPPORTED_LOCALES = SUPPORTED;

applyHtmlLang();
