/**
 * H-2：Memory 列表统一 VM（不向外散堆 JSONL 原始行；由 Core 列表项映射而来）。
 */
import type { MemoryListItemVm } from "../../services/coreMemoryService";

export type MemoryOriginKind = "system_auto" | "user_explicit";

/** 与产品文案对齐：task / template / user（preference→user）/ result 归入系统或用户侧展示 */
export type MemorySourceCategory = "task" | "template" | "user" | "result" | "unknown";

export type MemoryRecordRowVm = {
  id: string;
  summary: string;
  sourceCategory: MemorySourceCategory;
  /** Core 原始 source 字段 */
  sourceRaw: string;
  originKind: MemoryOriginKind;
  memoryType: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
};

function classifySourceCategory(source: string): MemorySourceCategory {
  const s = source.trim().toLowerCase();
  if (s === "template") return "template";
  if (s === "preference") return "user";
  if (s === "task") return "task";
  if (s === "result") return "result";
  return "unknown";
}

function classifyOrigin(source: string): MemoryOriginKind {
  const s = source.trim().toLowerCase();
  if (s === "preference" || s === "template") return "user_explicit";
  return "system_auto";
}

export function memoryListItemToRecordRowVm(row: MemoryListItemVm): MemoryRecordRowVm {
  const summary = (row.valuePreview || row.key || "").trim() || "—";
  const sourceRaw = row.source?.trim() || "task";
  return {
    id: row.memoryId,
    summary: summary.length > 500 ? `${summary.slice(0, 497)}…` : summary,
    sourceCategory: classifySourceCategory(sourceRaw),
    sourceRaw,
    originKind: classifyOrigin(sourceRaw),
    memoryType: row.memoryType || "successful_task_hint",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isActive: row.isActive
  };
}
