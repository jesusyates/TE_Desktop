import type { AicsDesktopApi } from "../types/desktopRuntime";

export function getAicsDesktop(): AicsDesktopApi | null {
  if (typeof window !== "undefined" && window.aicsDesktop) {
    return window.aicsDesktop as AicsDesktopApi;
  }
  return null;
}
