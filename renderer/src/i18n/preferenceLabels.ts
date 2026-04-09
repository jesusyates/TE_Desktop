/**
 * 偏好：国家/地区、语言 — 仅展示层映射，不改变底层 cn / zh-CN 等取值。
 */

export const PREF_MARKET_IDS = ["cn", "jp", "global"] as const;
export const PREF_LOCALE_IDS = ["zh-CN", "ja-JP", "en-US"] as const;

export type PrefMarketId = (typeof PREF_MARKET_IDS)[number];
export type PrefLocaleId = (typeof PREF_LOCALE_IDS)[number];

export type UiLangMode = "zh" | "en" | "ja";

export function getUiLangMode(effectiveLocale: string): UiLangMode {
  const l = String(effectiveLocale || "").trim();
  if (l === "ja-JP") return "ja";
  if (l === "en-US") return "en";
  return "zh";
}

const MARKET_LABEL: Record<PrefMarketId, Record<UiLangMode, string>> = {
  cn: { zh: "中国 🇨🇳", en: "China 🇨🇳", ja: "中国 🇨🇳" },
  jp: { zh: "日本 🇯🇵", en: "Japan 🇯🇵", ja: "日本 🇯🇵" },
  global: { zh: "全球 🌍", en: "Global 🌍", ja: "グローバル 🌍" }
};

const LOCALE_LABEL: Record<PrefLocaleId, Record<UiLangMode, string>> = {
  "zh-CN": { zh: "中文", en: "Chinese", ja: "中国語" },
  "en-US": { zh: "English", en: "English", ja: "English" },
  "ja-JP": { zh: "日本語", en: "Japanese", ja: "日本語" }
};

export function formatPrefMarket(id: string, mode: UiLangMode): string {
  const row = MARKET_LABEL[id as PrefMarketId];
  return row ? row[mode] : id;
}

export function formatPrefLocale(id: string, mode: UiLangMode): string {
  const row = LOCALE_LABEL[id as PrefLocaleId];
  return row ? row[mode] : id;
}
