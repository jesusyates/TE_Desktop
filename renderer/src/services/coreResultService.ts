/**
 * D-7-3H：仅从 AI 网关读取归档结果（HTTP 封装，不散落在 UI）。
 * D-7-4Z：**secondary persistence** — 用于结果区覆盖展示；执行流以本地 `useExecutionSession` 为准。
 */
import type { TaskResult } from "../modules/result/resultTypes";
import { aiGatewayClient } from "./apiClient";

export type CoreResultRecord = {
  savedAt: string;
  runId?: string;
  prompt: string;
  result: TaskResult;
  stepResults?: Record<string, TaskResult>;
  /** D-7-3Q：sha256(prompt+canonical result) */
  hash?: string;
};

function parseStepResults(raw: unknown): Record<string, TaskResult> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, TaskResult> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const tr = parseTaskResult(v);
    if (tr) out[k] = tr;
  }
  return Object.keys(out).length ? out : undefined;
}

function parseTaskResult(raw: unknown): TaskResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.kind === "content") {
    const title = typeof o.title === "string" ? o.title : "";
    const body = typeof o.body === "string" ? o.body : "";
    if (!title && !body) return null;
    return {
      kind: "content",
      title,
      body,
      ...(typeof o.summary === "string" ? { summary: o.summary } : {}),
      ...(o.metadata && typeof o.metadata === "object"
        ? { metadata: o.metadata as Record<string, unknown> }
        : {}),
      ...(typeof o.action === "string" ? { action: o.action } : {}),
      ...(typeof o.stepCount === "number" ? { stepCount: o.stepCount } : {}),
      ...(typeof o.durationMs === "number" ? { durationMs: o.durationMs } : {})
    };
  }
  if (o.kind === "computer") {
    const title = typeof o.title === "string" ? o.title : "";
    if (!title && !o.body) return null;
    return {
      kind: "computer",
      title,
      ...(typeof o.body === "string" ? { body: o.body } : {}),
      ...(typeof o.summary === "string" ? { summary: o.summary } : {}),
      ...(o.metadata && typeof o.metadata === "object"
        ? { metadata: o.metadata as Record<string, unknown> }
        : {}),
      ...(typeof o.environmentLabel === "string" ? { environmentLabel: o.environmentLabel } : {}),
      ...(typeof o.targetApp === "string" ? { targetApp: o.targetApp } : {}),
      ...(typeof o.stepCount === "number" ? { stepCount: o.stepCount } : {}),
      ...(typeof o.eventCount === "number" ? { eventCount: o.eventCount } : {})
    };
  }
  return null;
}

function normalizeCoreRow(raw: unknown): CoreResultRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const result = parseTaskResult(o.result);
  if (!result) return null;
  const prompt = typeof o.prompt === "string" ? o.prompt : "";
  const savedAt = typeof o.savedAt === "string" ? o.savedAt : "";
  const runId = typeof o.runId === "string" ? o.runId : undefined;
  const stepResults = parseStepResults(o.stepResults);
  const hash = typeof o.hash === "string" && o.hash.trim() ? o.hash.trim() : undefined;
  return { savedAt, runId, prompt, result, stepResults, ...(hash ? { hash } : {}) };
}

export async function listCoreResults(limit = 20): Promise<CoreResultRecord[]> {
  const lim = Math.min(100, Math.max(1, limit));
  const { data, status } = await aiGatewayClient.get<unknown>(`/results?limit=${lim}`, {
    validateStatus: () => true
  });
  const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (status < 200 || status >= 300) {
    const msg =
      "message" in obj && typeof obj.message === "string"
        ? obj.message
        : `HTTP ${status}`;
    throw new Error(msg || "请求失败");
  }
  if (obj.success !== true || !Array.isArray(obj.items)) {
    const msg =
      "message" in obj && typeof obj.message === "string" ? obj.message : "invalid results response";
    throw new Error(msg);
  }
  const out: CoreResultRecord[] = [];
  for (const it of obj.items) {
    const n = normalizeCoreRow(it);
    if (n) out.push(n);
  }
  return out;
}

export async function getCoreResultByRunId(runId: string): Promise<CoreResultRecord | null> {
  const rid = runId.trim();
  if (!rid) return null;
  const { data, status } = await aiGatewayClient.get<unknown>(`/results/${encodeURIComponent(rid)}`, {
    validateStatus: () => true
  });
  if (status === 404) return null;
  const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (status < 200 || status >= 300) {
    const msg =
      "message" in obj && typeof obj.message === "string"
        ? obj.message
        : `HTTP ${status}`;
    throw new Error(msg || "请求失败");
  }
  if (obj.success !== true) {
    const msg =
      "message" in obj && typeof obj.message === "string" ? obj.message : "invalid result response";
    throw new Error(msg);
  }
  return normalizeCoreRow(obj.item);
}
