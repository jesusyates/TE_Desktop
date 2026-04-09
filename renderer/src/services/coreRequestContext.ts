/**
 * D-7-3J / D-7-3P：AICS Core 身份头；正式会话由 authSession 驱动，未登录为可区分 guest。
 */

import { getAuthSessionSnapshot } from "./authSession";

const GUEST_USER_ID = "guest-user";
const AUTH_HEADER_MODE = "x-aics-auth-mode";

function stableDeviceSuffix(): string {
  try {
    if (typeof localStorage !== "undefined") {
      let id = localStorage.getItem("aics_core_device_id");
      if (!id) {
        id = `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem("aics_core_device_id", id);
      }
      return id;
    }
  } catch {
    /* private mode 等 */
  }
  return "local";
}

/**
 * Core HTTP 调用统一附带：`x-aics-client-id`、`x-aics-user-id`、`x-aics-session-token`
 * - `x-aics-session-token`：已登录映射为 access token；guest 为稳定 `guest:<device>`（非 JWT）
 * - `x-aics-auth-mode`：`session` | `guest`，供 Core 区分（非鉴权判决）
 */
export function getCoreRequestHeaders(): Record<string, string> {
  const snap = getAuthSessionSnapshot();
  const device = stableDeviceSuffix();
  const clientId = `desktop-local-${device}`;

  if (!snap.isGuest && snap.userId && snap.accessToken) {
    return {
      "x-aics-client-id": clientId,
      "x-aics-user-id": snap.userId,
      "x-aics-session-token": snap.accessToken,
      [AUTH_HEADER_MODE]: "session"
    };
  }

  const guestToken = `guest:${device}`;
  return {
    "x-aics-client-id": clientId,
    "x-aics-user-id": GUEST_USER_ID,
    "x-aics-session-token": guestToken,
    [AUTH_HEADER_MODE]: "guest"
  };
}
