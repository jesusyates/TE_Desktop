/**
 * D-7-3Y：Core 审计事件上报与列表（失败不影响主链）。
 * D-7-4Z：secondary persistence / audit — 非执行真相源。
 */

import { coreAuditRecordToDomainModel } from "../domain/mappers/auditEventMapper";
import type { AuditEventDomainModel } from "../domain/models/auditEventDomainModel";
import { aiGatewayClient } from "./apiClient";

export type CoreAuditEventType =
  | "safety_block"
  | "permission_block"
  | "auth_escalation_required"
  | "emergency_stop"
  | "execution_budget_exceeded"
  | "automation_disabled"
  | "high_risk_disabled";

export type CoreAuditEventRecord = {
  userId: string;
  clientId: string;
  sessionToken?: string;
  runId: string;
  taskId?: string;
  eventType: string;
  decision?: string;
  level?: string;
  reason?: string;
  createdAt: string;
};

export type PostCoreAuditInput = {
  runId: string;
  taskId?: string;
  eventType: CoreAuditEventType;
  decision?: string;
  level?: string;
  reason?: string;
};

async function postCoreAuditEvent(input: PostCoreAuditInput): Promise<void> {
  try {
    await aiGatewayClient.post(
      "/audit-event",
      {
        runId: input.runId,
        ...(input.taskId?.trim() ? { taskId: input.taskId.trim() } : {}),
        eventType: input.eventType,
        ...(input.decision != null && input.decision !== "" ? { decision: input.decision } : {}),
        ...(input.level != null && input.level !== "" ? { level: input.level } : {}),
        ...(input.reason != null && input.reason !== "" ? { reason: input.reason } : {})
      },
      { headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  } catch {
    /* 故意忽略：审计不得阻塞执行 */
  }
}

/** 非阻塞写入 Core（网络失败静默） */
export function scheduleCoreAuditEvent(input: PostCoreAuditInput): void {
  void postCoreAuditEvent(input);
}

function normalizeLimit(limit?: number | string): number {
  const n = typeof limit === "number" ? limit : Number(limit);
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(200, Math.floor(n));
}

/** 原始列表（仅服务内校验与测试；调用方请用 {@link listCoreAuditEvents}）。 */
export async function fetchCoreAuditEventRecords(limit?: number): Promise<CoreAuditEventRecord[]> {
  const lim = normalizeLimit(limit);
  try {
    const { data: body, status } = await aiGatewayClient.get<unknown>(`/audit-events?limit=${lim}`, {
      validateStatus: () => true
    });
    const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    if (status < 200 || status >= 300 || o.success !== true || !Array.isArray(o.items)) return [];
    return o.items.filter(
      (x): x is CoreAuditEventRecord =>
        x != null &&
        typeof x === "object" &&
        typeof (x as CoreAuditEventRecord).runId === "string" &&
        typeof (x as CoreAuditEventRecord).eventType === "string"
    );
  } catch {
    return [];
  }
}

/**
 * D-7-4V：拉取 Core 审计列表并统一映射为 {@link AuditEventDomainModel}（页面禁止直接消费原始 items）。
 */
export async function listCoreAuditEvents(limit?: number): Promise<AuditEventDomainModel[]> {
  const raw = await fetchCoreAuditEventRecords(limit);
  return raw.map(coreAuditRecordToDomainModel);
}
