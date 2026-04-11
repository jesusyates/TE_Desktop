import { useMemo } from "react";
import { useAuthStore } from "../store/authStore";
import { getUiStrings, type UiCatalog } from "./uiCatalog";

/**
 * 全局 UI 文案：locale 唯一来自 `authStore.locale`（登录前后同一套；与 `displayLocale` / X-Client-* 对齐）。
 */
export function useUiStrings(): UiCatalog {
  const locale = useAuthStore((s) => s.locale);
  return useMemo(() => getUiStrings(locale), [locale]);
}
