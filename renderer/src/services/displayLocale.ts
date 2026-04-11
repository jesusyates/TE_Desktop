/**
 * 桌面端唯一显示用 market/locale（与 vault 登录态解耦持久化）。
 *
 * 优先级（后者仅在前者缺失时生效）：
 * 1) 用户手动选择（登录前语言切换 / 显式写入并带 user-lock）
 * 2) 已登录且未 lock：账号偏好（/auth/me、refresh、偏好 PUT）
 * 3) localStorage 缓存（`LOCALE_KEY` / `MARKET_KEY`）
 * 4) 设备语言（`navigator.language`）
 * 5) zh-CN + market 默认 cn，其余 global（安装程序 / IP 地区识别可预写 `*_KEY`，在此处视同缓存层）
 *
 * 安装包首次启动：可在展示 Web UI 前写入 `aics-display-locale`（及可选 `aics-display-market`），
 * 与 `LOCALE_INSTALLER_HINT_KEY` 配合以便本进程识别（预留）。
 */
export const DISPLAY_LOCALE_STORAGE_KEY = "aics-display-locale";
export const DISPLAY_MARKET_STORAGE_KEY = "aics-display-market";

const LOCALE_KEY = DISPLAY_LOCALE_STORAGE_KEY;
const MARKET_KEY = DISPLAY_MARKET_STORAGE_KEY;
/** 用户显式选择界面语言后置位；为 true 时 hydrate/登录不再用账号 locale 覆盖显示 */
const USER_LOCK_KEY = "aics-display-locale-user-lock";
/** 预留：安装向导已写入 locale 时可置位，供 UI 显示「安装程序语言」提示等 */
const LOCALE_INSTALLER_HINT_KEY = "aics-installer-locale-applied";

const VALID_LOCALES = new Set(["zh-CN", "en-US", "ja-JP"]);

export function normalizeUiLocale(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (VALID_LOCALES.has(s)) return s;
  return null;
}

export function inferLocaleFromNavigator(): string {
  if (typeof navigator === "undefined") return "en-US";
  const lang = (navigator.language || "en-US").toLowerCase();
  if (lang.startsWith("zh")) return "zh-CN";
  if (lang.startsWith("ja")) return "ja-JP";
  if (lang.startsWith("en")) return "en-US";
  return "en-US";
}

export function isDisplayLocaleUserLocked(): boolean {
  try {
    return localStorage.getItem(USER_LOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDisplayLocaleUserLocked(locked: boolean): void {
  try {
    if (locked) localStorage.setItem(USER_LOCK_KEY, "1");
    else localStorage.removeItem(USER_LOCK_KEY);
  } catch {
    /* ignore */
  }
}

/** 安装程序若已写入语言，可置 `1`；供未来首屏「安装语言」锚点（当前仅占位读取） */
export function wasInstallerLocaleApplied(): boolean {
  try {
    return localStorage.getItem(LOCALE_INSTALLER_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

/** UI 语言 → 默认 X-Client-Market；与后端 global-ready 约定一致 */
export function defaultMarketForLocale(locale: string): string {
  const n = normalizeUiLocale(locale);
  if (n === "zh-CN") return "cn";
  return "global";
}

/**
 * 缓存层或设备推断：无账号参与时的初始 locale。
 */
export function getInitialDisplayLocale(): string {
  try {
    const stored = normalizeUiLocale(localStorage.getItem(LOCALE_KEY));
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  return inferLocaleFromNavigator();
}

/** 缓存层或根据已解析 locale 推导默认 market */
export function getInitialDisplayMarket(): string {
  try {
    const v = localStorage.getItem(MARKET_KEY);
    if (v != null && String(v).trim() !== "") return String(v).trim().toLowerCase();
  } catch {
    /* ignore */
  }
  return defaultMarketForLocale(getInitialDisplayLocale());
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
    const m = String(market || "global").trim().toLowerCase();
    localStorage.setItem(MARKET_KEY, m || "global");
  } catch {
    /* ignore */
  }
}

/** 账号偏好与设置页保存成功后调用：清除「用户手动锁定」，此后以账号 / PUT 为准 */
export function clearDisplayLocaleUserPreferenceLock(): void {
  setDisplayLocaleUserLocked(false);
}
