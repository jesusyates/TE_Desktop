import { adaptResult } from "../../../execution/session/adapters";
import { isTaskResult, toTaskResult, toTemplateResultSnapshot } from "../../result/resultAdapters";
import type { TemplateResultSnapshot } from "../types/template";

/**
 * 从 session / 流式 result 生成模板快照：优先 TaskResult → toTemplateResultSnapshot，其次旧 adaptResult。
 */
export function buildTemplateResultSnapshot(result: unknown): TemplateResultSnapshot {
  const task = isTaskResult(result) ? result : toTaskResult(result);
  if (task) return toTemplateResultSnapshot(task);
  const a = adaptResult(result);
  if (a) {
    return {
      title: a.title,
      bodyPreview: a.body.length > 800 ? `${a.body.slice(0, 800)}…` : a.body,
      stepCount: a.stepCount ?? 0,
      durationLabel: a.durationLabel
    };
  }
  return {
    title: "（无结构化结果摘要）",
    bodyPreview: "",
    stepCount: 0,
    durationLabel: null
  };
}

/** 深拷贝步骤数组，避免持久化引用到 session 内可变数组 */
export function cloneStepsSnapshot(steps: unknown): unknown[] {
  if (!Array.isArray(steps)) return [];
  try {
    return JSON.parse(JSON.stringify(steps)) as unknown[];
  } catch {
    return [];
  }
}
