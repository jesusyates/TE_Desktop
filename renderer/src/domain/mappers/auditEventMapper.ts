/**
 * D-7-4T：客户端审计入参 / v1 记录形 → AuditEventDomainModel
 */

import type { CoreAuditEventRecord, PostCoreAuditInput } from "../types/coreAuditTypes";
import type { AuditEventDomainModel } from "../models/auditEventDomainModel";

export function postCoreAuditInputToDomainModel(
  input: PostCoreAuditInput,
  createdAtIso: string
): AuditEventDomainModel {
  return {
    runId: input.runId,
    taskId: input.taskId?.trim() || undefined,
    eventType: input.eventType,
    decision: input.decision,
    level: input.level,
    reason: input.reason,
    createdAt: createdAtIso
  };
}

/**
 * v1 行：`eventType` 顶层；`runId`/`taskId`/决策类字段在 `payload`（或与 POST 体合并后的 payload）
 */
export function coreAuditRecordToDomainModel(r: CoreAuditEventRecord): AuditEventDomainModel {
  const p = r.payload && typeof r.payload === "object" ? r.payload : {};
  const runRaw = p.runId;
  const runId =
    typeof runRaw === "string" && runRaw.trim() ? runRaw.trim() : "—";
  const taskRaw = p.taskId;
  const decRaw = p.decision;
  const levRaw = p.level;
  const reaRaw = p.reason;
  return {
    auditId: r.auditId,
    runId,
    taskId: typeof taskRaw === "string" && taskRaw.trim() ? taskRaw : undefined,
    eventType: r.eventType,
    decision: typeof decRaw === "string" && decRaw.trim() ? decRaw : undefined,
    level: typeof levRaw === "string" && levRaw.trim() ? levRaw : undefined,
    reason: typeof reaRaw === "string" && reaRaw.trim() ? reaRaw : undefined,
    createdAt: r.createdAt.trim() || new Date().toISOString()
  };
}
