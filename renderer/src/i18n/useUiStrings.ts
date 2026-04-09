import { useMemo } from "react";
import { useAuthStore } from "../store/authStore";
import { getUiStrings, type UiCatalog } from "./uiCatalog";

export function useUiStrings(): UiCatalog {
  const locale = useAuthStore((s) => s.locale);
  return useMemo(() => getUiStrings(locale), [locale]);
}
