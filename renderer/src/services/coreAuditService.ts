/**
 * D-7-3Y：审计 — Shared Core `POST|GET /v1/audit-events`（apiClient）。
 * 写入 fire-and-forget、失败静默；列表失败返回空数组（含 401 未登录）。
 */

import type { AuditEventDomainModel } from "../domain/models/auditEventDomainModel";
import { coreAuditRecordToDomainModel } from "../domain/mappers/auditEventMapper";
import type {
  CoreAuditEventRecord,
  PostCoreAuditInput
} from "../domain/types/coreAuditTypes";
import { apiClient } from "./apiClient";
import { normalizeV1ResponseBody } from "./v1Envelope";

export type { CoreAuditEventRecord, CoreAuditEventType, PostCoreAuditInput } from "../domain/types/coreAuditTypes";

function normalizeLimit(limit?: number | string): number {
  const n = typeof limit === "number" ? limit : Number(limit);
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(200, Math.floor(n));
}

function parseV1AuditItem(raw: unknown): CoreAuditEventRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const auditId = String(o.auditId ?? o.id ?? "").trim();
  const userId = String(o.userId ?? o.user_id ?? "").trim();
  const eventType = String(o.eventType ?? o.event_type ?? "").trim();
  const createdAt = String(o.createdAt ?? o.created_at ?? "").trim();
  if (!auditId || !eventType) return null;
  const pr = o.payload;
  const payload =
    pr != null && typeof pr === "object" && !Array.isArray(pr) ? (pr as Record<string, unknown>) : {};
  return {
    auditId,
    userId,
    eventType,
    payload,
    createdAt,
    market: typeof o.market === "string" ? o.market : undefined,
    locale: typeof o.locale === "string" ? o.locale : undefined,
    product: typeof o.product === "string" ? o.product : undefined
  };
}

async function postCoreAuditEvent(input: PostCoreAuditInput): Promise<void> {
  try {
    const { status } = await apiClient.post<unknown>(
      "/v1/audit-events",
      {
        eventType: input.eventType,
        runId: input.runId,
        ...(input.taskId?.trim() ? { taskId: input.taskId.trim() } : {}),
        ...(input.decision != null && input.decision !== "" ? { decision: input.decision } : {}),
        ...(input.level != null && input.level !== "" ? { level: input.level } : {}),
        ...(input.reason != null && input.reason !== "" ? { reason: input.reason } : {})
      },
      { validateStatus: () => true }
    );
    if (status < 200 || status >= 300) return;
  } catch {
    /* 故意忽略：审计不得阻塞执行 */
  }
}

/** 非阻塞写入 Core（网络失败静默） */
export function scheduleCoreAuditEvent(input: PostCoreAuditInput): void {
  void postCoreAuditEvent(input);
}

/** 原始列表（测试/扩展用）；401 / 失败返回 [] */
export async function fetchCoreAuditEventRecords(limit?: number): Promise<CoreAuditEventRecord[]> {
  const lim = normalizeLimit(limit);
  try {
    const { data: raw, status } = await apiClient.get<unknown>(`/v1/audit-events?limit=${lim}`, {
      validateStatus: () => true
    });
    if (status === 401 || status < 200 || status >= 300) return [];
    const inner = normalizeV1ResponseBody(raw) as { items?: unknown } | null;
    const arr = Array.isArray(inner?.items) ? inner.items : [];
    const out: CoreAuditEventRecord[] = [];
    for (const it of arr) {
      const row = parseV1AuditItem(it);
      if (row) out.push(row);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * D-7-4V：拉取 Core 审计列表并映射为 {@link AuditEventDomainModel}
 */
export async function listCoreAuditEvents(limit?: number): Promise<AuditEventDomainModel[]> {
  const raw = await fetchCoreAuditEventRecords(limit);
  return raw.map(coreAuditRecordToDomainModel);
}
