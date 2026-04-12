/**
 * AICS v1：首页统一入口 — 阶段与本地分析结果（与 UI 状态机对齐）
 */

export type EntryStage =
  | "idle"
  | "analyzing"
  | "needs_clarification"
  | "ready_to_execute"
  | "executing"
  | "done"
  | "error";

export type AnalyzeResult = {
  canExecute: boolean;
  /** 不可执行时说明 */
  reason?: string;
  /** 不可执行时给用户的调整建议（短列表，可选） */
  suggestions?: string[];

  needsClarification?: boolean;
  /** 单轮对话式追问（优先于 questions） */
  clarificationLine?: string;
  questions?: string[];

  /** 给用户看的简化执行说明 */
  planSummary?: string;
  riskLevel?: "L1" | "L2" | "L3" | "L4";
};
