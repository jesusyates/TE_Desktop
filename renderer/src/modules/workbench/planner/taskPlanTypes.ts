export type TaskStepType = "capability" | "content" | "human";

export interface TaskStep {
  id: string;
  type: TaskStepType;

  capabilityId?: string;
  contentAction?: string;

  humanAction?: "confirm";
  title?: string;
  message?: string;

  status: "pending" | "running" | "success" | "error";

  metadata?: Record<string, unknown>;

  /** 线性编排：依赖的上一步 id；null 表示无前继（预留 DAG 扩展） */
  dependsOnStepId?: string | null;
  /** 默认 true：本步成功后可写入 stepResults（human 等可显式 false） */
  producesResult?: boolean;
  /** 稳定业务键，供模板/摘要引用（与 step.id 不同） */
  resultKey?: string;

  /** capability 失败时跳转的步骤 id；null/undefined 表示进入会话 error */
  onErrorNextStepId?: string | null;
}

export interface TaskPlan {
  id: string;
  steps: TaskStep[];
}

export function getStepById(plan: TaskPlan, id: string): TaskStep | undefined {
  return plan.steps.find((s) => s.id === id);
}

/** 返回下一序号；已在最后一步则返回 null */
export function getNextStepIndex(plan: TaskPlan, currentIndex: number): number | null {
  const n = currentIndex + 1;
  return n < plan.steps.length ? n : null;
}
