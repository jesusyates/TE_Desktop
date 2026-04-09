/**
 * D-7-3P：桌面会话快照（唯一收口：Core 与其它模块只读此处，禁止直接读 tokenStorage）。
 * MODULE C-3：已登录须 hydrated 且 userId + accessToken 均由验证后的 store 写入（冷启动以 /auth/me 为准）。
 */

import { useAuthStore } from "../store/authStore";

export type AuthSessionSnapshot = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  hydrated: boolean;
  /** 未就绪或未登录：走 Core guest 头 */
  isGuest: boolean;
};

/**
 * 已登录：`hydrate` 完成且 access + userId 均来自后端。
 * 未登录或恢复失败：guest，与正式用户可区分。
 */
export function getAuthSessionSnapshot(): AuthSessionSnapshot {
  const s = useAuthStore.getState();
  const accessToken = (s.accessToken || "").trim();
  const userId = (s.userId || "").trim();
  const refreshToken = (s.refreshToken || "").trim();
  const hasSession = s.hydrated && accessToken !== "" && userId !== "";
  return {
    userId,
    accessToken,
    refreshToken,
    hydrated: s.hydrated,
    isGuest: !hasSession
  };
}
