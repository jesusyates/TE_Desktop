/**
 * Auth v1 Step 3：单例静默 refresh，供 apiClient 401、hydrate、/auth/me 恢复共用。
 */
import { useAuthStore } from "../store/authStore";
import { readRefreshTokenFromVault } from "./clientSession";
import { refreshRequest } from "./authApi";

let inFlight: Promise<boolean> | null = null;

export function tryRefreshSession(): Promise<boolean> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const rt = ((await readRefreshTokenFromVault()) || "").trim();
      if (!rt) return false;
      const data = await refreshRequest(rt);
      const at = (data.access_token || "").trim();
      const nr = (data.refresh_token || "").trim();
      if (!at || !nr) return false;
      await useAuthStore.getState().setTokens(at, nr, {
        userId: data.user.user_id,
        userEmail: (data.user.email || "").trim()
      });
      useAuthStore.getState().setSessionLocale(data.user.market, data.user.locale);
      return true;
    } catch {
      return false;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
