/**
 * MODULE C-4：桌面端统一登出流程。页面与 Shell 必须经此入口，禁止直接 `clearTokenVault` / `tokenService` / 零散改 store。
 */
import type { NavigateFunction } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

/**
 * 调用服务端登出（如有 refresh）、清空 vault、重置 authStore，并跳转登录页。
 */
export async function performLogoutToLogin(navigate: NavigateFunction): Promise<void> {
  await useAuthStore.getState().logout();
  navigate("/login", { replace: true });
}
