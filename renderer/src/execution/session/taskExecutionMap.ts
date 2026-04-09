import type { ExecutionStatus } from "./execution";

/**
 * D-2-4C：后端 task.status → 前端 ExecutionStatus（唯一映射入口，UI 禁止直接使用 rawStatus）。
 */
export function mapBackendStatusToExecutionStatus(rawStatus: string): ExecutionStatus {
  const s = rawStatus.trim().toLowerCase();
  switch (s) {
    case "pending":
    case "planning":
    case "ready":
      return "queued";
    case "running":
      return "running";
    case "paused":
      return "paused";
    case "success":
    case "partial_success":
      return "success";
    case "failed":
      return "error";
    case "cancelled":
      return "stopped";
    case "stopping":
      return "stopping";
    default:
      return "queued";
  }
}
