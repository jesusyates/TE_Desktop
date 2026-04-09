/**
 * D-7-4T/H：AICS Domain — 审计事件（客户端上报 / 列表记录的业务收口形）。
 */

export type AuditEventDomainModel = {
  runId: string;
  taskId?: string;
  eventType: string;
  decision?: string;
  level?: string;
  reason?: string;
  createdAt: string;
};
