/**
 * D-2-2：单任务执行会话 — 状态与动作模型（与 TaskStatus / 后端解耦，便于接日志与多执行器）。
 * D-7-4Z：本模块与 `useExecutionSession` 的状态字段共同构成 **authoritative execution source**；远端 Core 任务状态不得覆盖此状态机。
 */

export type ExecutionStatus =
  | "idle"
  | "validating"
  | "queued"
  | "running"
  | "paused"
  | "stopping"
  | "stopped"
  | "success"
  | "error";

export type ExecutionAction = "start" | "pause" | "resume" | "stop" | "retry" | "clear";

/** 每个状态允许的前端控制动作（可扩展：后续由同一表驱动权限/遥测）。 */
export const EXECUTION_ALLOWED_ACTIONS: Readonly<Record<ExecutionStatus, readonly ExecutionAction[]>> = {
  idle: ["start"],
  validating: [],
  queued: [],
  running: ["pause", "stop"],
  paused: ["resume", "stop"],
  stopping: [],
  stopped: ["retry", "clear"],
  success: ["retry", "clear"],
  error: ["retry", "clear"]
};

export function getAllowedActions(status: ExecutionStatus): ExecutionAction[] {
  return [...EXECUTION_ALLOWED_ACTIONS[status]];
}

export function isExecutionActionAllowed(status: ExecutionStatus, action: ExecutionAction): boolean {
  return EXECUTION_ALLOWED_ACTIONS[status].includes(action);
}

/** 四阶段时间轴（与 UI ExecutionStage 对齐）。 */
export type ExecutionPhase = "task_received" | "preparing" | "running" | "completed";

export function statusToActivePhase(status: ExecutionStatus): ExecutionPhase | null {
  switch (status) {
    case "idle":
      return null;
    case "validating":
      return "task_received";
    case "queued":
      return "preparing";
    case "running":
    case "paused":
    case "stopping":
      return "running";
    case "stopped":
    case "success":
    case "error":
      return "completed";
    default:
      return null;
  }
}

export function isExecutionTerminal(status: ExecutionStatus): boolean {
  return status === "success" || status === "error" || status === "stopped";
}

/**
 * 任务快照轮询：仅在进行态且存在 taskId 时继续请求 GET /v1/tasks/:id。
 * runId 预留与 run 级轮询对齐；当前快照轮询仅依赖 task.status。
 */
export function shouldPollTaskStatus(
  executionStatus: ExecutionStatus,
  taskId: string,
  _runId?: string | null
): boolean {
  if (!String(taskId ?? "").trim()) return false;
  return !isExecutionTerminal(executionStatus);
}

/**
 * D-7-5P：进行态（validating / queued / running / paused / stopping）。
 * success / error / stopped / idle 均为非进行态：可展示终态，但不得锁死下一次发送。
 */
export function isExecutionInProgress(status: ExecutionStatus): boolean {
  return status !== "idle" && !isExecutionTerminal(status);
}

/**
 * D-7-6L：工作台「发送」是否应被「仍在执行」拦截（与 {@link isExecutionInProgress} 同源，仅用 **最终派生 status**）。
 * 不得混用 currentTaskId / rawStatus；终态 success / error / stopped 必为 false。
 */
export function isExecutionBlockingSubmit(executionStatus: ExecutionStatus): boolean {
  return isExecutionInProgress(executionStatus);
}
