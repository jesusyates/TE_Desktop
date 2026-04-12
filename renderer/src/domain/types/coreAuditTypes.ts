/**
 * Shared Core 审计 v1 类型（供 service / mapper 共用，避免循环依赖）
 */

export type CoreAuditEventType =
  | "safety_block"
  | "permission_block"
  | "auth_escalation_required"
  | "emergency_stop"
  | "execution_budget_exceeded"
  | "automation_disabled"
  | "high_risk_disabled";

/** 与 v1 API `item` / `items` 行一致（payload 为服务端归一对象） */
export type CoreAuditEventRecord = {
  auditId: string;
  userId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  market?: string;
  locale?: string;
  product?: string;
};

export type PostCoreAuditInput = {
  runId: string;
  taskId?: string;
  eventType: CoreAuditEventType;
  decision?: string;
  level?: string;
  reason?: string;
};
