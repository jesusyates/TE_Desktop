/**
 * D-7-3K：从 Shared Core GET /v1/usage 读取 usage 列表（HTTP 封装，不带入 UI）。
 */
import { apiClient } from "./apiClient";
import { normalizeV1ResponseBody } from "./v1Envelope";

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

function parseV1UsageItems(inner: Record<string, unknown> | null, limit: number): CoreUsageItem[] {
  const usageRaw = inner && Array.isArray(inner.usage) ? inner.usage : [];
  const out: CoreUsageItem[] = [];
  for (const it of usageRaw) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    out.push({
      userId: typeof r.userId === "string" ? r.userId : "",
      clientId: typeof r.provider === "string" ? r.provider : "",
      runId: typeof r.runId === "string" ? r.runId : "",
      prompt: "",
      mode: typeof r.product === "string" ? r.product : "usage",
      ...(typeof r.totalTokens === "number" && Number.isFinite(r.totalTokens) ? { stepCount: r.totalTokens } : {}),
      success: true,
      createdAt: typeof r.createdAt === "string" ? r.createdAt : ""
    });
    if (out.length >= limit) break;
  }
  return out;
}

export type CoreQuotaSummary = {
  plan: string;
  quotaLimit: number;
  quotaUsed: number;
  quotaRemaining: number;
};

/** GET /v1/quota — 与账户 entitlement 同源摘要，供独立诊断或未来 UI使用 */
export async function fetchCoreQuota(): Promise<CoreQuotaSummary> {
  const { data: raw, status } = await apiClient.get<unknown>("/v1/quota", { validateStatus: () => true });
  if (status < 200 || status >= 300) {
    const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const msg = typeof o.message === "string" ? o.message : `HTTP ${status}`;
    throw new Error(msg || "请求失败");
  }
  const d = normalizeV1ResponseBody(raw) as Record<string, unknown> | null;
  if (!d || typeof d !== "object") {
    throw new Error("invalid_quota_response");
  }
  return {
    plan: typeof d.plan === "string" ? d.plan : "",
    quotaLimit: Number(d.quotaLimit) || 0,
    quotaUsed: Number(d.quotaUsed) || 0,
    quotaRemaining: Number(d.quotaRemaining) || 0
  };
}

/** GET /v1/usage — 按会话用户过滤，由服务端完成 */
export async function listCoreUsage(limit = 50): Promise<CoreUsageItem[]> {
  const lim = Math.min(100, Math.max(1, limit));
  const { data: raw, status } = await apiClient.get<unknown>("/v1/usage", {
    validateStatus: () => true
  });
  if (status < 200 || status >= 300) {
    const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const msg = typeof o.message === "string" ? o.message : `HTTP ${status}`;
    throw new Error(msg || "请求失败");
  }
  const inner = normalizeV1ResponseBody(raw) as Record<string, unknown> | null;
  return parseV1UsageItems(inner && typeof inner === "object" ? inner : null, lim);
}
