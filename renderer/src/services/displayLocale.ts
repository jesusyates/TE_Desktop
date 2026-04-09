/**
 * 显示用 market/locale：与登录态解耦持久化，避免「登录前英文 / 登录后中文」与刷新后闪变。
 * 登录后与 /auth/me、偏好保存一致时写入；未登录时来自上次会话或浏览器语言推测。
 */
const LOCALE_KEY = "aics-display-locale";
const MARKET_KEY = "aics-display-market";
const VALID_LOCALES = new Set(["zh-CN", "en-US", "ja-JP"]);

export function normalizeUiLocale(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (VALID_LOCALES.has(s)) return s;
  return null;
}

export function inferLocaleFromNavigator(): string {
  if (typeof navigator === "undefined") return "zh-CN";
  const lang = (navigator.language || "zh-CN").toLowerCase();
  if (lang.startsWith("zh")) return "zh-CN";
  if (lang.startsWith("ja")) return "ja-JP";
  if (lang.startsWith("en")) return "en-US";
  return "zh-CN";
}

/** 浏览器推断的 UI 语言（无持久化时用于登录页与登出后） */
export function getInitialDisplayLocale(): string {
  try {
    const stored = normalizeUiLocale(localStorage.getItem(LOCALE_KEY));
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  return inferLocaleFromNavigator();
}

export function getInitialDisplayMarket(): string {
  try {
    const v = localStorage.getItem(MARKET_KEY);
    if (v != null && String(v).trim() !== "") return String(v).trim().toLowerCase();
  } catch {
    /* ignore */
  }
  return "global";
}

export function persistDisplayLocale(locale: string): void {
  const n = normalizeUiLocale(locale);
  if (!n) return;
  try {
    localStorage.setItem(LOCALE_KEY, n);
  } catch {
    /* ignore */
  }
}

export function persistDisplayMarket(market: string): void {
  try {
    localStorage.setItem(MARKET_KEY, String(market || "global").trim().toLowerCase());
  } catch {
    /* ignore */
  }
}
