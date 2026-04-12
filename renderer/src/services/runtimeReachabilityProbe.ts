/**
 * D-7-4Z / P3：诊断用可达性探测（不驱动执行流；仅设置页只读展示）。
 * 主探活：**Shared Core `GET /health`**（`probeSharedCoreReachability`）。
 * 已移除历史独立服务的 `GET /analyze` 探活，避免误导「探针可达 = 产品可用」。
 */

import { SHARED_CORE_BASE_URL } from "../config/runtimeEndpoints";
import { authApiClient } from "./authApi";

export type ReachabilityProbeResult = "ok" | "unreachable";

function withTimeout(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  globalThis.setTimeout(() => c.abort(), ms);
  return c.signal;
}

/**
 * Shared Core 可达性：仅 `GET /health`（根路由、公共探活，不经过 `/v1` 的客户端头强校验）。
 * 不使用 `/v1/status`，避免生产环境缺少上下文头时 `CLIENT_HEADERS_REQUIRED` 导致误判整站不可用。
 */
export async function probeSharedCoreReachability(): Promise<ReachabilityProbeResult> {
  if (!String(SHARED_CORE_BASE_URL).trim()) return "unreachable";
  try {
    const res = await authApiClient.get("/health", {
      signal: withTimeout(4500),
      validateStatus: () => true
    });
    const st = res.status;
    return typeof st === "number" && st >= 200 && st < 300 ? "ok" : "unreachable";
  } catch {
    return "unreachable";
  }
}
