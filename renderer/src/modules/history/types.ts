/**
 * D-1：正式 History（Shared Core persistence）；侧栏与 /history 页共用条目形状。
 * 保留 core/local 枚举值以兼容 warm 缓存与旧 VM 映射。
 */
export type TaskHistorySource = "server" | "core" | "local";

export type TaskHistoryListEntry = {
  source: TaskHistorySource;
  id: string;
  /** D-1：server 行与 id 相同 */
  historyId?: string;
  /** J-1+：可选关联 Core execution task，用于工作台只读恢复 */
  executionTaskId?: string;
  status: string;
  mode?: string;
  prompt: string;
  preview?: string;
  createdAt: string;
  updatedAt: string;
  /** source === "core" 时用于 GET /results/:runId */
  coreRunId?: string;
};
