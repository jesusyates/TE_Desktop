/**
 * F-1 / F-2A：Execution Pipeline — 唯一执行计划结构（顺序多步）。
 */

import type { ResultSource } from "../../result/resultTypes";

export type ExecutionPlanStatus = "pending" | "running" | "success" | "error" | "stopped";

/** F-1A：`human_confirm` 使用 `waiting_confirm` 表示正式等待（非模型执行中） */
export type ExecutionPlanStepStatus =
  | "pending"
  | "running"
  | "waiting_confirm"
  | "success"
  | "error"
  | "stopped";

/**
 * F-1A / F-2A：执行步类型；语义分派
 * — `summarize` 仅消费前序产出，不得伪装为 `generate`
 * — `capability` 为本地受控能力步（F-2A），不得用 generate 冒充
 * — `local_*`：Local Runtime v1（无云端、无 AI）
 */
export type ExecutionPlanStepType =
  | "generate"
  | "summarize"
  | "human_confirm"
  | "capability"
  | "local_scan"
  | "local_read"
  | "local_text_transform"
  | "local_file_operation";

export function isLocalExecutionStepType(
  t: ExecutionPlanStepType
): t is "local_scan" | "local_read" | "local_text_transform" | "local_file_operation" {
  return (
    t === "local_scan" ||
    t === "local_read" ||
    t === "local_text_transform" ||
    t === "local_file_operation"
  );
}

/** 单步产出（F-3：每项须带 source） */
export type ExecutionStepOutput =
  | {
      kind: "content";
      source: ResultSource;
      title: string;
      body: string;
      summary?: string;
      action?: string;
    }
  | {
      kind: "capability";
      source: ResultSource;
      title: string;
      body: string;
      summary?: string;
      capabilityType: string;
      operation: string;
    };

export interface ExecutionPlanStep {
  stepId: string;
  type: ExecutionPlanStepType;
  title: string;
  description: string;
  status: ExecutionPlanStepStatus;
  /** 步骤输入：如 contentAction、prompt 片段键等 */
  input: Record<string, unknown>;
  output: ExecutionStepOutput | null;
  /** human_confirm 展示文案 */
  humanMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionPlan {
  planId: string;
  taskId: string;
  status: ExecutionPlanStatus;
  steps: ExecutionPlanStep[];
}

export function cloneExecutionPlan(plan: ExecutionPlan): ExecutionPlan {
  return {
    ...plan,
    steps: plan.steps.map((s) => ({ ...s, input: { ...s.input }, output: s.output ? { ...s.output } : null }))
  };
}
