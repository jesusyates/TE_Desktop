/**
 * MODULE C-2/C-3：统一会话字段读口与令牌持久化入口。
 * - 业务与页面禁止直接读写 token 相关 sessionStorage / secureToken；一律经此模块。
 * - userId / userEmail 以 authStore 为准；冷启动时 authStore 仅在 /auth/me 成功后写入，不得仅因 vault 有串而等同已登录。
 * - 登出清 vault 仅经 `authStore.logout` / `performLogoutToLogin`，禁止页面直调 tokenService。
 * - 读侧通过异步导入 store 避免与 authStore 循环依赖。
 */

import { tokenService } from "./tokenService";

async function getAuthState() {
  const { useAuthStore } = await import("../store/authStore");
  return useAuthStore.getState();
}

/** 仅 authStore / 登出路径：持久化 access / refresh */
export async function persistAccessRefreshTokens(access: string, refresh: string): Promise<void> {
  await tokenService.setTokens(access, refresh);
}

export async function readRefreshTokenFromVault(): Promise<string> {
  return tokenService.getRefresh();
}

export async function clearTokenVault(): Promise<void> {
  await tokenService.clear();
}

export const clientSession = {
  getAccessToken: (): Promise<string> => tokenService.getAccess(),

  async getAccessTokenTrimmed(): Promise<string> {
    const t = await tokenService.getAccess();
    return (t || "").trim();
  },

  async getUserId(): Promise<string> {
    return ((await getAuthState()).userId || "").trim();
  },

  async getUserEmail(): Promise<string> {
    return ((await getAuthState()).userEmail || "").trim();
  },

  /** C-2 占位：与 Shared Core session 对齐前保持空串 */
  getSessionTokenPlaceholder(): string {
    return "";
  },

  async getMarket(): Promise<string> {
    return (await getAuthState()).market || "global";
  },

  async getLocale(): Promise<string> {
    return (await getAuthState()).locale || "en-US";
  }
};
