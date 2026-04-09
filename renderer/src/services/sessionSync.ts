import { tryRefreshSession } from "./authSilentRefresh";
import { readRefreshTokenFromVault } from "./clientSession";
import { useAuthStore } from "../store/authStore";

/**
 * C-6：响应 X-Session-Refresh-Recommended 后空闲刷新。禁止每请求立即 refresh；禁止客户端维护 session_version。
 * 后台空闲调度仍用此入口；与 apiClient 401 静默 refresh 共用 `tryRefreshSession`（单例互斥）。
 * MODULE C-4：此处仅调用 `logout()` 清本地；无路由跳转，受保护路由由 RequireAuth 检测空会话后重定向登录。
 */
const DEBOUNCE_MS = 400;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let refreshInFlight: Promise<void> | null = null;

function desktopLog(
  event: string,
  fields: Partial<{
    user_id: string;
    market: string;
    locale: string;
    product: string;
    client_platform: string;
  }>
) {
  console.log(
    JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      source: "aics-desktop-session-sync",
      ...fields
    })
  );
}

export const sessionSync = {
  scheduleRefresh() {
    if (debounceTimer != null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void sessionSync.flushRefresh();
    }, DEBOUNCE_MS);
  },

  async flushRefresh() {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      const rt = await readRefreshTokenFromVault();
      if (!rt) {
        refreshInFlight = null;
        return;
      }
      const snap = useAuthStore.getState();
      useAuthStore.getState().setSyncStatus("refresh_pending");
      desktopLog("background_refresh_started", {
        market: snap.market,
        locale: snap.locale,
        product: "aics",
        client_platform: "desktop"
      });
      try {
        const ok = await tryRefreshSession();
        if (!ok) throw new Error("refresh_failed");
        const st = useAuthStore.getState();
        useAuthStore.getState().setSyncStatus("synced");
        desktopLog("background_refresh_succeeded", {
          user_id: st.userId,
          market: st.market,
          locale: st.locale,
          product: "aics",
          client_platform: "desktop"
        });
      } catch {
        desktopLog("background_refresh_failed", {
          market: snap.market,
          locale: snap.locale,
          product: "aics",
          client_platform: "desktop"
        });
        await useAuthStore.getState().logout();
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  }
};
