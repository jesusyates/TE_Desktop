/**
 * Intent Enrichment v1：执行前规则化「任务理解」（无 AI、无后端）。
 */

import type { StartTaskPayload } from "../../types/task";
import { readLightMemories } from "../memory/lightMemoryEvolution";
import { extractCoreThemeForNextTask } from "./nextTaskSuggestions";

export type EnrichedIntentTaskType = "content" | "local" | "general";

export type EnrichedIntentV1 = {
  taskType: EnrichedIntentTaskType;
  subject: string;
  structure: string;
  executionMode: string;
};

export type PendingIntentPreviewStateV1 = {
  originalInput: string;
  enrichedIntent: EnrichedIntentV1;
  payloadSnapshot: StartTaskPayload;
};

function inferTaskType(input: string): EnrichedIntentTaskType {
  if (/整理|文件|分类/.test(input)) return "local";
  if (/写|文章|内容/.test(input)) return "content";
  return "general";
}

export function extractSubjectForIntent(userInput: string): string {
  const s = extractCoreThemeForNextTask("", userInput).trim();
  if (s.length >= 2 && s !== "该主题") return s.slice(0, 80);
  const mem = readLightMemories();
  const last = mem.length ? mem[mem.length - 1] : null;
  if (last?.title) {
    const inner = last.title.match(/「([^」]+)」/);
    if (inner?.[1]?.trim()) return inner[1].trim().slice(0, 80);
    return last.title.trim().slice(0, 80);
  }
  return "该主题";
}

export function buildEnrichedIntent(userInput: string): EnrichedIntentV1 {
  const raw = userInput.trim();
  const taskType = inferTaskType(raw);
  const structure =
    taskType === "content"
      ? "结构化文章（标题 + 小节 + 总结）"
      : taskType === "local"
        ? "本地文件操作"
        : "通用任务处理";
  const executionMode = taskType === "local" ? "本地执行" : "云端 AI";
  return {
    taskType,
    subject: extractSubjectForIntent(raw),
    structure,
    executionMode
  };
}

/** 预览主句（与 enriched 类型一致） */
export function formatIntentPreviewPrimaryLine(e: EnrichedIntentV1): string {
  if (e.taskType === "content") {
    return `生成一篇关于「${e.subject}」的结构化文章`;
  }
  if (e.taskType === "local") {
    return `将围绕「${e.subject}」进行本地文件操作`;
  }
  return `将处理与「${e.subject}」相关的通用任务`;
}
