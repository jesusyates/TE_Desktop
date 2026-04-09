/**
 * D-7-4D：保存模板时的 platform / workflowType 轻量推断（收口，不散落 UI）。
 */

import { toTaskResult } from "../modules/result/resultAdapters";
import type { TaskResult } from "../modules/result/resultTypes";
import type { Template } from "../modules/templates/types/template";
import type { ResolvedTaskMode, TaskMode } from "../types/taskMode";

export type TemplateSaveInferenceSeeds = Pick<Template, "platform" | "workflowType"> | null;

export type TemplateSaveInferenceContext = {
  resolvedMode: ResolvedTaskMode;
  activeMode: TaskMode;
  /** 本次任务启动时携带的模板（用于继承 platform / workflowType） */
  seedTemplate?: TemplateSaveInferenceSeeds;
  unifiedResult: TaskResult | null;
  /** 事件流 result（与 unified 并列供兜底） */
  streamResult: unknown;
  sourcePrompt: string;
};

export type InferredTemplateMetadata = {
  platform: string;
  workflowType: string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function workflowFromKind(result: TaskResult | null): "content" | "automation" | null {
  if (!result) return null;
  if (result.kind === "computer") return "automation";
  if (result.kind === "content") return "content";
  return null;
}

function normalizeSeedWorkflow(w: string | undefined): "content" | "automation" | null {
  const s = (w ?? "").toLowerCase().trim();
  if (!s) return null;
  if (s === "computer" || s === "automation") return "automation";
  if (s === "content") return "content";
  return null;
}

/**
 * workflowType：会话模式（computer 优先）→ result.kind → 种子模板 → content
 */
export function inferTemplateWorkflowType(ctx: TemplateSaveInferenceContext): string {
  const modeAutomation = ctx.resolvedMode === "computer" || ctx.activeMode === "computer";
  const k = workflowFromKind(ctx.unifiedResult) ?? workflowFromKind(toTaskResult(ctx.streamResult));

  if (modeAutomation) return "automation";
  if (k === "automation") return "automation";
  if (k === "content") return "content";

  const fromSeed = normalizeSeedWorkflow(ctx.seedTemplate?.workflowType);
  if (fromSeed) return fromSeed;

  return "content";
}

function pickPlatformFromResults(ctx: TemplateSaveInferenceContext): string | undefined {
  const fromMeta = (r: TaskResult | null): string | undefined => {
    const p = r?.metadata && typeof r.metadata === "object" ? (r.metadata as Record<string, unknown>).platform : undefined;
    return typeof p === "string" && p.trim() ? p.trim() : undefined;
  };

  const u = fromMeta(ctx.unifiedResult);
  if (u) return u;

  const streamTr = toTaskResult(ctx.streamResult);
  const s = fromMeta(streamTr);
  if (s) return s;

  const raw = asRecord(ctx.streamResult);
  const top = raw?.platform;
  if (typeof top === "string" && top.trim()) return top.trim();

  return undefined;
}

/**
 * platform：结果/载荷显式字段 → 种子模板 → user-saved
 */
export function inferTemplatePlatform(ctx: TemplateSaveInferenceContext): string {
  const fromRun = pickPlatformFromResults(ctx);
  if (fromRun) return fromRun;

  const seed = ctx.seedTemplate?.platform?.trim();
  if (seed) return seed;

  const prompt = ctx.sourcePrompt.trim();
  const m = prompt.match(/(?:^|\n)\s*平台\s*[:：]\s*(\S+)/i);
  if (m?.[1]) return m[1].trim();

  return "user-saved";
}

export function inferTemplateSaveMetadata(ctx: TemplateSaveInferenceContext): InferredTemplateMetadata {
  return {
    platform: inferTemplatePlatform(ctx),
    workflowType: inferTemplateWorkflowType(ctx)
  };
}
