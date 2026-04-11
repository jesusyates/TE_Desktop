/**
 * MODULE C-6：身份失效时的统一出口（清 vault + store + 退出应用）。页面禁止自行 clearTokenVault。
 * 与主动登出共用 `performLogoutAndQuitApp`，避免两套清理逻辑。
 */
import { performLogoutAndQuitApp } from "./authLogoutFlow";

let invalidationInFlight: Promise<void> | null = null;

/**
 * 受保护业务请求返回明确 401 等：清会话并退出应用（幂等合并并发）。
 * 名称保留以兼容 apiClient；行为为退出而非回登录页。
 */
export function invalidateAuthenticatedSessionAndGoLogin(): Promise<void> {
  if (invalidationInFlight) return invalidationInFlight;
  invalidationInFlight = (async () => {
    try {
      await performLogoutAndQuitApp();
    } finally {
      invalidationInFlight = null;
    }
  })();
  return invalidationInFlight;
}
