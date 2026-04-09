/**
 * D-7-4Z：诊断用可达性探测（不驱动执行流；仅设置页只读展示）。
 * D-7-5A：探测目标与 `config/runtimeEndpoints` 一致。
 */

import { SHARED_CORE_BASE_URL } from "../config/runtimeEndpoints";
import { authApiClient } from "./authApi";
import { aiGatewayClient } from "./apiClient";

export type ReachabilityProbeResult = "ok" | "unreachable";

function withTimeout(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  globalThis.setTimeout(() => c.abort(), ms);
  return c.signal;
}

/** Shared Core：`GET /auth/me` 无 token 时 401 仍表示服务进程可达 */
export async function probeSharedCoreReachability(): Promise<ReachabilityProbeResult> {
  if (!String(SHARED_CORE_BASE_URL).trim()) return "unreachable";
  try {
    const res = await authApiClient.get("/auth/me", {
      signal: withTimeout(4500),
      validateStatus: () => true
    });
    return typeof res.status === "number" && res.status > 0 ? "ok" : "unreachable";
  } catch {
    return "unreachable";
  }
}

/**
 * AI 网关：对 `/analyze` 发起 `GET`（若返回 404/405 仍视为主机已响应）。
 */
export async function probeAiGatewayReachability(): Promise<ReachabilityProbeResult> {
  try {
    const res = await aiGatewayClient.get("/analyze", {
      signal: withTimeout(4500),
      validateStatus: () => true
    });
    return typeof res.status === "number" && res.status > 0 ? "ok" : "unreachable";
  } catch {
    return "unreachable";
  }
}
