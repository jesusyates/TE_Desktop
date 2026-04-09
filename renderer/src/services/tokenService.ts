/**
 * 桌面端令牌经 Electron preload → 主进程存储。
 * 浏览器降级 sessionStorage 仅便于本地调 UI，非权威；禁止绕过 Shared Core 自建登录态。
 * MODULE C-2：业务层须通过 `clientSession` 读写持久化令牌，禁止直接调用本模块（除 `clientSession` 与历史桥接外）。
 */

const memoryFallback = { access: "", refresh: "" };

async function getBridge() {
  if (typeof window !== "undefined" && window.secureToken) return window.secureToken;
  return null;
}

export const tokenService = {
  getAccess: async (): Promise<string> => {
    const b = await getBridge();
    if (b?.getAccess) return b.getAccess();
    if (typeof sessionStorage !== "undefined") return sessionStorage.getItem("aics_access") || "";
    return memoryFallback.access;
  },

  getRefresh: async (): Promise<string> => {
    const b = await getBridge();
    if (b?.getRefresh) return b.getRefresh();
    if (typeof sessionStorage !== "undefined") return sessionStorage.getItem("aics_refresh") || "";
    return memoryFallback.refresh;
  },

  setTokens: async (access: string, refresh: string): Promise<void> => {
    const b = await getBridge();
    if (b?.setTokens) {
      await b.setTokens(access, refresh);
      return;
    }
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("aics_access", access);
      sessionStorage.setItem("aics_refresh", refresh);
      return;
    }
    memoryFallback.access = access;
    memoryFallback.refresh = refresh;
  },

  clear: async (): Promise<void> => {
    const b = await getBridge();
    if (b?.clear) {
      await b.clear();
      return;
    }
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("aics_access");
      sessionStorage.removeItem("aics_refresh");
    }
    memoryFallback.access = "";
    memoryFallback.refresh = "";
  }
};
