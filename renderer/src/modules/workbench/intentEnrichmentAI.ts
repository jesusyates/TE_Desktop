/**
 * AI-assisted Intent Enrichment v1：AI 优先理解，失败/超时回退规则版 buildEnrichedIntent。
 * 仅用于 Execution Preview，不触发任务执行。
 *
 * 调用：`invokeAiContentOnCore`（POST /ai/content · generate），经现有 AI 网关；客户端 800ms 超时即 fallback。
 * 产品说明中的 temperature/max_tokens 由网关侧路由默认策略承载，当前请求体仅含 action + prompt。
 */

import { invokeAiContentOnCore } from "../../services/api";
import { buildEnrichedIntent, type EnrichedIntentV1, type EnrichedIntentTaskType } from "./intentEnrichment";

const INTENT_AI_TIMEOUT_MS = 800;

function buildIntentUnderstandingPrompt(userInput: string): string {
  const escaped = userInput.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
  return `你是一个任务理解助手，请把用户输入转换为结构化任务理解。

用户输入：
"${escaped}"

请输出 JSON（不要解释）：

{
  "taskType": "content | local | general",
  "subject": "主题",
  "structure": "任务结构描述",
  "executionMode": "cloud | local"
}`;
}

function parseIntentJsonFromBody(body: string): unknown {
  const t = body.trim();
  try {
    return JSON.parse(t) as unknown;
  } catch {
    const idx = t.indexOf("{");
    const j = idx >= 0 ? t.lastIndexOf("}") : -1;
    if (idx >= 0 && j > idx) {
      try {
        return JSON.parse(t.slice(idx, j + 1)) as unknown;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function normalizeTaskType(v: unknown): EnrichedIntentTaskType | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  if (t === "content" || t === "local" || t === "general") return t;
  return null;
}

function normalizeExecutionMode(v: unknown): "cloud" | "local" | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  if (t === "cloud") return "cloud";
  if (t === "local") return "local";
  return null;
}

function isValidAiIntent(
  raw: unknown
): Omit<EnrichedIntentV1, "executionMode"> & { executionMode: "cloud" | "local"; taskType: EnrichedIntentTaskType } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const taskType = normalizeTaskType(o.taskType);
  const executionModeH = normalizeExecutionMode(o.executionMode);
  if (!taskType || !executionModeH) return null;
  if (typeof o.subject !== "string" || !o.subject.trim()) return null;
  if (typeof o.structure !== "string" || !o.structure.trim()) return null;
  return {
    taskType,
    subject: o.subject,
    structure: o.structure,
    executionMode: executionModeH
  };
}

function toEnrichedFromAi(ai: {
  taskType: EnrichedIntentTaskType;
  subject: string;
  structure: string;
  executionMode: "cloud" | "local";
}): EnrichedIntentV1 {
  return {
    taskType: ai.taskType,
    subject: ai.subject.trim().slice(0, 200),
    structure: ai.structure.trim().slice(0, 500),
    executionMode: ai.executionMode === "local" ? "本地执行" : "云端 AI"
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (typeof window === "undefined") return promise;
  return new Promise<T>((resolve, reject) => {
    const tid = window.setTimeout(() => {
      reject(new Error("intent_ai_timeout"));
    }, ms);
    promise.then(
      (v) => {
        window.clearTimeout(tid);
        resolve(v);
      },
      (e: unknown) => {
        window.clearTimeout(tid);
        reject(e);
      }
    );
  });
}

/** 经 AI Gateway /ai/content（generate）；返回 null 表示不可用，由调用方 fallback */
export async function callIntentAI(userInput: string): Promise<EnrichedIntentV1 | null> {
  const line = userInput.trim();
  if (!line) return null;
  const prompt = buildIntentUnderstandingPrompt(line);
  const res = await invokeAiContentOnCore({ action: "generate", prompt });
  const raw = parseIntentJsonFromBody(res.body);
  const norm = isValidAiIntent(raw);
  if (!norm) return null;
  return toEnrichedFromAi(norm);
}

export async function buildEnrichedIntentWithAI(userInput: string): Promise<EnrichedIntentV1> {
  const raw = userInput.trim();
  if (!raw) return buildEnrichedIntent(raw);
  try {
    const aiResult = await withTimeout(callIntentAI(raw), INTENT_AI_TIMEOUT_MS);
    if (aiResult) {
      console.log("[IntentAI] success");
      return aiResult;
    }
  } catch {
    /* timeout / 网络 / 解析失败 → 规则兜底 */
  }
  console.log("[IntentAI] fallback");
  return buildEnrichedIntent(raw);
}
