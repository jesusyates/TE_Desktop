/**
 * MODULE C-4：桌面端统一登出流程。页面与 Shell 必须经此入口，禁止直接 `clearTokenVault` / `tokenService` / 零散改 store。
 *
 * 临时策略：登出后清会话与本地缓存并直接退出应用（`app.quit`），不在当前渲染会话内再进入登录页，避免已知输入焦点问题。
 */
import { useAuthStore } from "../store/authStore";
import { clearLocalWorkbenchDraftsAndExecutionCaches } from "../modules/preferences/localAppCachesClear";

export const LOGOUT_FINISHED_EVENT = "aics:logout-finished";

function clearLocalCachesBeforeQuit(): void {
  clearLocalWorkbenchDraftsAndExecutionCaches();
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
}

/** 在已调用 `logout()` 之后：清非令牌本地缓存、派发事件、请求主进程退出。 */
export async function finalizeLocalCachesAndQuitApp(): Promise<void> {
  clearLocalCachesBeforeQuit();
  window.dispatchEvent(new CustomEvent(LOGOUT_FINISHED_EVENT, { detail: { route: "quit" } }));
  try {
    await window.desktopUpdate?.quitApp();
  } catch {
    /* ignore */
  }
}

/** 主动登出：服务端 revoke + vault + store，再清缓存并退出。 */
export async function performLogoutAndQuitApp(): Promise<void> {
  await useAuthStore.getState().logout();
  await finalizeLocalCachesAndQuitApp();
}
