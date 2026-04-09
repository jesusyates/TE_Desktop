/**
 * D-7-4T：客户端审计入参 / Core 记录形 → AuditEventDomainModel
 */

import type { CoreAuditEventRecord, PostCoreAuditInput } from "../../services/coreAuditService";
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

export function coreAuditRecordToDomainModel(r: CoreAuditEventRecord): AuditEventDomainModel {
  return {
    runId: r.runId,
    taskId: r.taskId,
    eventType: r.eventType,
    decision: r.decision,
    level: r.level,
    reason: r.reason,
    createdAt: r.createdAt
  };
}
