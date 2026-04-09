/**
 * D-7-4T：AICS Domain — 任务（业务稳定字段，不替代 ExecutionTask / TaskVM）。
 */

import type { ResolvedTaskMode } from "../../types/taskMode";

export type TaskDomainSource = "workbench" | "template" | "history" | "unknown";

/** 与后端 TaskStatus 字符串对齐，domain 层保持宽松 string 以便演进 */
export type TaskDomainModel = {
  id: string;
  prompt: string;
  status: string;
  source: TaskDomainSource;
  createdAt: string;
  updatedAt?: string;
  mode?: ResolvedTaskMode;
  sourceTemplateId?: string;
};
