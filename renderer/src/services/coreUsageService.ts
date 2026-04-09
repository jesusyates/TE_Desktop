/**
 * D-7-3K：从 Core 读取 usage 列表（HTTP 封装，不带入 UI）。
 */
import { aiGatewayClient } from "./apiClient";

export type CoreUsageItem = {
  userId: string;
  clientId: string;
  runId: string;
  prompt: string;
  mode: string;
  stepCount?: number;
  success: boolean;
  createdAt: string;
};

function parseItems(body: unknown): CoreUsageItem[] {
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (obj.success !== true || !Array.isArray(obj.items)) return [];
  const out: CoreUsageItem[] = [];
  for (const it of obj.items) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    out.push({
      userId: typeof r.userId === "string" ? r.userId : "",
      clientId: typeof r.clientId === "string" ? r.clientId : "",
      runId: typeof r.runId === "string" ? r.runId : "",
      prompt: typeof r.prompt === "string" ? r.prompt : "",
      mode: typeof r.mode === "string" ? r.mode : "unknown",
      ...(typeof r.stepCount === "number" && Number.isFinite(r.stepCount) ? { stepCount: r.stepCount } : {}),
      success: typeof r.success === "boolean" ? r.success : true,
      createdAt: typeof r.createdAt === "string" ? r.createdAt : ""
    });
  }
  return out;
}

/** GET /usage?limit= — 按请求头 userId 过滤，由服务端完成 */
export async function listCoreUsage(limit = 50): Promise<CoreUsageItem[]> {
  const lim = Math.min(100, Math.max(1, limit));
  const { data, status } = await aiGatewayClient.get<unknown>(`/usage?limit=${lim}`, {
    validateStatus: () => true
  });
  if (status < 200 || status >= 300) {
    const o = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const msg = typeof o.message === "string" ? o.message : `HTTP ${status}`;
    throw new Error(msg || "请求失败");
  }
  return parseItems(data);
}
