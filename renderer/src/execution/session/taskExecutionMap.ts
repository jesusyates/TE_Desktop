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
    case "completed":
    case "complete":
    case "succeeded":
    case "done":
      return "success";
    case "failed":
    case "error":
      return "error";
    case "cancelled":
    case "canceled":
      return "stopped";
    case "stopping":
      return "stopping";
    default:
      return "queued";
  }
}
