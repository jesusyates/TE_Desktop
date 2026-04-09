/**
 * D-7-4V：Audit 领域模型 → 设置页等只读列表用轻量 VM。
 */

import type { AuditEventDomainModel } from "../domain/models/auditEventDomainModel";

export type AuditEventListItemVM = {
  eventType: string;
  level: string;
  reason: string;
  createdAt: string;
};

export function mapAuditEventDomainToListItemVM(
  d: AuditEventDomainModel,
  emptyLabel: string
): AuditEventListItemVM {
  const level = (d.level ?? "").trim();
  const reason = (d.reason ?? "").trim();
  return {
    eventType: d.eventType,
    level: level || emptyLabel,
    reason: reason || emptyLabel,
    createdAt: d.createdAt
  };
}
