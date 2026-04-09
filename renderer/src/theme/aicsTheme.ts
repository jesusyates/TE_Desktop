import { getAicsDesktop } from "../services/desktopBridge";

/** AICS Design System v1 — 主题仅 dark / light，持久化本地 */
export const AICS_THEME_STORAGE_KEY = "aics-ui-theme";
/** 与产品约定键名对齐，与 LEGACY 双写避免漂移 */
export const AICS_THEME_SPEC_KEY = "theme";

export type AicsUiTheme = "dark" | "light";

function isTheme(v: string | null): v is AicsUiTheme {
  return v === "dark" || v === "light";
}

export function getStoredTheme(): AicsUiTheme {
  try {
    const a = localStorage.getItem(AICS_THEME_STORAGE_KEY);
    if (isTheme(a)) return a;
    const b = localStorage.getItem(AICS_THEME_SPEC_KEY);
    if (isTheme(b)) return b;
  } catch {
    /* ignore */
  }
  return "light";
}

function syncDomThemeClass(theme: AicsUiTheme) {
  const root = document.documentElement;
  root.classList.remove("theme-light", "theme-dark");
  root.classList.add(theme === "dark" ? "theme-dark" : "theme-light");
}

export function applyTheme(theme: AicsUiTheme) {
  document.body.dataset.theme = theme;
  syncDomThemeClass(theme);
  try {
    localStorage.setItem(AICS_THEME_STORAGE_KEY, theme);
    localStorage.setItem(AICS_THEME_SPEC_KEY, theme);
  } catch {
    /* ignore */
  }
  const desk = getAicsDesktop();
  void desk?.setUiChromeTheme?.(theme);
}

export function initTheme() {
  applyTheme(getStoredTheme());
}
