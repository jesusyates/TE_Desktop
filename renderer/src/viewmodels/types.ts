/**
 * D-7-4H：Task / Result / History 统一 ViewModel（UI 消费入口，禁止长期直连多套原始结构）。
 */

import type { OutputTrust, ResultSource } from "../modules/result/resultTypes";

export type TaskVMSource = "execution" | "core" | "workbench" | "local";

export type TaskVM = {
  id: string;
  prompt: string;
  status: string;
  source: TaskVMSource;
  createdAt: string;
  updatedAt: string;
  /** D-7-4I：结果独立页 / 回放侧卡摘要 */
  plannerSource?: string;
  runType?: "new" | "rerun";
  sourceTaskId?: string;
};

export type ResultVMKind = "content" | "computer" | "unknown";

export type ResultVM = {
  kind: ResultVMKind;
  title: string;
  body: string;
  summary: string;
  source: string;
  hash?: string;
  hasCoreSync?: boolean;
};

/** D-7-4J：结果页步骤列表展示（页面不直连 ExecutionStep 字段） */
export type ExecutionStepVM = {
  id: string;
  order: number;
  title: string;
  status: string;
  latencyMs: number;
  errorText: string;
};

export type HistoryItemVMSource = "core" | "execution" | "local" | "server";

export type HistoryItemVM = {
  id: string;
  title: string;
  status: string;
  source: HistoryItemVMSource;
  updatedAt: string;
  createdAt: string;
  /** 来自 ExecutionTask.steps；warm 摘要无步数时为 0 */
  stepCount: number;
  lastErrorSummary?: string;
  hasDetailCache: boolean;
  /** execution 任务：Planner 来源；warm/core 摘要可能无 */
  plannerSource?: string;
  /** J-1：正式历史行（server）展示用 */
  prompt?: string;
  preview?: string;
  mode?: string;
  /** J-1+：与 ResultPanel 同源标签 */
  resultSource: ResultSource;
  outputTrust: OutputTrust;
};
