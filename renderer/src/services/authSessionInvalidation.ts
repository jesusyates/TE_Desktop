/**
 * MODULE C-6：身份失效时的统一出口（清 vault + store + 回登录页）。页面禁止自行 clearTokenVault。
 * 与主动登出共用 authStore.logout，避免两套清理逻辑。
 */
import { useAuthStore } from "../store/authStore";

type NavigateFn = (path: string, opts?: { replace?: boolean }) => void;

let navigateRef: NavigateFn | null = null;
let invalidationInFlight: Promise<void> | null = null;

export function registerAuthGlobalNavigate(nav: NavigateFn): void {
  navigateRef = nav;
}

export function unregisterAuthGlobalNavigate(): void {
  navigateRef = null;
}

/**
 * 受保护业务请求返回明确 401 等：清会话并导航登录（幂等合并并发）。
 */
export function invalidateAuthenticatedSessionAndGoLogin(): Promise<void> {
  if (invalidationInFlight) return invalidationInFlight;
  invalidationInFlight = (async () => {
    try {
      await useAuthStore.getState().logout();
      navigateRef?.("/login", { replace: true });
    } finally {
      invalidationInFlight = null;
    }
  })();
  return invalidationInFlight;
}
