import type { TaskResult } from "./resultTypes";
import { isNonProductionResultSource } from "./resultSourcePolicy";

function metaRecord(r: TaskResult): Record<string, unknown> | null {
  const m = r.metadata;
  return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : null;
}

/**
 * D-7-6I：占位 / 模拟结果识别（仅用于 UI，不改动执行链）。
 * — `deterministic_placeholder`：D-5-8 本地占位生成
 * — `computer_placeholder`：computer 分支占位摘要
 * — 字符串回退：兼容无 metadata 的旧快照
 */
export function isMockPlaceholderTaskResult(r: TaskResult | null | undefined): boolean {
  if (r == null) return false;
  if (r.kind === "content" && r.resultSource && isNonProductionResultSource(r.resultSource)) {
    return true;
  }
  const meta = metaRecord(r);
  if (meta?.aiOutcome === "local_stub") return true;
  if (meta?.mode === "deterministic_placeholder") return true;
  if (meta?._source === "computer_placeholder") return true;

  if (r.kind === "content") {
    const t = r.title ?? "";
    const b = r.body ?? "";
    if (b.includes("占位结果") || /\bD-5-8\b/i.test(b) || b.includes("未接多模型路由")) return true;
    if (t === "Generated Result" && b.includes("占位")) return true;
  }
  return false;
}

/** 冻结/扁平字段回退（localStorage 旧数据无 TaskResult.metadata） */
export function isMockPlaceholderFrozenFields(
  resultKind: "content" | "computer" | undefined,
  resultTitle: string | undefined,
  resultBody: string | undefined
): boolean {
  if (resultKind === "computer") return false;
  const t = (resultTitle ?? "").trim();
  const b = (resultBody ?? "").trim();
  if (!t && !b) return false;
  if (b.includes("占位结果") || /\bD-5-8\b/i.test(b) || b.includes("未接多模型路由")) return true;
  return t === "Generated Result" && b.includes("占位");
}
