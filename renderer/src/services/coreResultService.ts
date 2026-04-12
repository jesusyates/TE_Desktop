/**
 * D-7-3H：Shared Core 归档结果（`GET /v1/history` 列表预览 + `GET /v1/results/:runId` 详情）。
 * D-7-4Z：**secondary persistence** — 用于结果区覆盖展示；执行流以本地 `useExecutionSession` 为准。
 */
import type { TaskResult } from "../modules/result/resultTypes";
import {
  computeOutputTrustFromDistinctSources,
  provenanceAuthenticityFromDistinctSources
} from "../modules/result/resultSourcePolicy";
import { apiClient } from "./apiClient";
import { normalizeV1ResponseBody } from "./v1Envelope";
import {
  mapServerExecutionResultToTaskResult,
  normalizeBackendResultSourceType
} from "./serverExecutionResultMap";

export type CoreResultRecord = {
  savedAt: string;
  runId?: string;
  prompt: string;
  result: TaskResult;
  stepResults?: Record<string, TaskResult>;
  /** D-7-3Q：sha256(prompt+canonical result) */
  hash?: string;
};

/**
 * 将 `GET /v1/history` 列表项映射为 CoreResultRecord（仅 summary 预览；完整正文用 `getCoreResultByRunId`）。
 */
function historyListItemToCoreResultRecord(row: unknown): CoreResultRecord | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const prompt = String(o.prompt ?? "").trim();
  const summary = String(o.summary ?? "").trim();
  const runId = String(o.runId ?? o.run_id ?? "").trim();
  const historyId = String(o.historyId ?? o.history_id ?? o.id ?? "").trim();
  const rst = String(o.resultSourceType ?? o.result_source_type ?? "mock");
  const savedAt = String(o.updatedAt ?? o.updated_at ?? o.createdAt ?? o.created_at ?? "").trim();
  const text = summary || prompt;
  if (!text && !runId) return null;
  const src = normalizeBackendResultSourceType(rst);
  const distinct = [src];
  const title = (
    text.split("\n").map((x) => x.trim()).find(Boolean) ||
    prompt.slice(0, 120) ||
    "历史摘要"
  ).slice(0, 500);
  const body = text || prompt || "—";
  const result: TaskResult = {
    kind: "content",
    title,
    body,
    ...(summary ? { summary } : {}),
    resultSource: src,
    metadata: {
      outputTrust: computeOutputTrustFromDistinctSources(distinct),
      resultProvenance: {
        steps: [],
        distinctSources: distinct,
        authenticity: provenanceAuthenticityFromDistinctSources(distinct)
      },
      _source: "v1_history_list",
      historyListPreview: true,
      ...(historyId ? { historyId } : {}),
      ...(runId ? { coreRunId: runId } : {})
    }
  };
  return {
    savedAt: savedAt || new Date().toISOString(),
    ...(runId ? { runId } : {}),
    prompt,
    result
  };
}

/** 列表统一走 Shared Core `GET /v1/history`（不再使用历史 `/results` 路径）。 */
export async function listCoreResults(limit = 20): Promise<CoreResultRecord[]> {
  const lim = Math.min(100, Math.max(1, limit));
  const { data: raw, status } = await apiClient.get<unknown>("/v1/history", {
    params: { page: 1, pageSize: lim },
    validateStatus: () => true
  });
  const top = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (status < 200 || status >= 300) {
    const msg =
      "message" in top && typeof top.message === "string" ? top.message : `HTTP ${status}`;
    throw new Error(msg || "请求失败");
  }
  const inner = normalizeV1ResponseBody(raw) as { items?: unknown[] } | null;
  const itemsRaw = inner && Array.isArray(inner.items) ? inner.items : [];
  const out: CoreResultRecord[] = [];
  for (const it of itemsRaw) {
    const n = historyListItemToCoreResultRecord(it);
    if (n) out.push(n);
  }
  return out;
}

export async function getCoreResultByRunId(runId: string): Promise<CoreResultRecord | null> {
  const rid = runId.trim();
  if (!rid) return null;
  const { data: raw, status } = await apiClient.get<unknown>(`/v1/results/${encodeURIComponent(rid)}`, {
    validateStatus: () => true
  });
  if (status === 404) return null;
  const top = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (status < 200 || status >= 300) {
    const msg =
      "message" in top && typeof top.message === "string" ? top.message : `HTTP ${status}`;
    throw new Error(msg || "请求失败");
  }
  const data = normalizeV1ResponseBody(raw) as Record<string, unknown> | null;
  if (!data || typeof data !== "object") return null;
  const resultRaw = data.result;
  const rst = String(data.resultSourceType ?? "mock");
  const taskResult = mapServerExecutionResultToTaskResult("", resultRaw, rst, data.templateSuggestion);
  if (!taskResult) return null;
  const savedAt =
    typeof data.updatedAt === "string"
      ? data.updatedAt
      : typeof data.createdAt === "string"
        ? data.createdAt
        : new Date().toISOString();
  return {
    savedAt,
    runId: String(data.runId ?? rid),
    prompt: "",
    result: taskResult,
    stepResults: undefined,
    hash: typeof data.hash === "string" ? data.hash : undefined
  };
}
