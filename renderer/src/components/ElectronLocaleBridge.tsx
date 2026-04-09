import { useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { getAicsDesktop } from "../services/desktopBridge";

/**
 * 将当前界面 locale 同步到主进程（Electron 右键菜单等），与 Zustand 展示语言一致。
 */
export const ElectronLocaleBridge = () => {
  const locale = useAuthStore((s) => s.locale);

  useEffect(() => {
    const api = getAicsDesktop();
    if (api && typeof api.setUiLocale === "function") {
      void api.setUiLocale(locale);
    }
  }, [locale]);

  return null;
};
