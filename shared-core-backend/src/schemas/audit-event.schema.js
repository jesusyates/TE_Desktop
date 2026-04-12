/**
 * v1 审计事件：入站校验与 API 归一（禁止在 route 内拼 DB 形状）。
 */

const MAX_EVENT_TYPE_LEN = 128;
const MAX_PAYLOAD_JSON_CHARS = 32000;

/**
 * @param {unknown} v
 * @returns {Record<string, unknown>}
 */
function shallowPayload(v) {
  if (v == null) return {};
  if (typeof v === "object" && !Array.isArray(v)) {
    try {
      const s = JSON.stringify(v);
      if (s.length > MAX_PAYLOAD_JSON_CHARS) {
        return { _truncated: true, note: "payload too large" };
      }
      return JSON.parse(s);
    } catch {
      return {};
    }
  }
  if (typeof v === "string") {
    const t = v.slice(0, MAX_PAYLOAD_JSON_CHARS);
    try {
      const o = JSON.parse(t);
      return o && typeof o === "object" && !Array.isArray(o) ? o : { raw: t };
    } catch {
      return { raw: t };
    }
  }
  return {};
}

/**
 * POST body → eventType + payload（忽略调用方传入的 userId / auditId）
 * @param {unknown} body
 * @returns {{ eventType: string, payload: Record<string, unknown> }}
 */
function normalizeAuditAppendPayload(body) {
  const b = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const eventType =
    typeof b.eventType === "string"
      ? b.eventType.trim().slice(0, MAX_EVENT_TYPE_LEN)
      : typeof b.event_type === "string"
        ? b.event_type.trim().slice(0, MAX_EVENT_TYPE_LEN)
        : "";
  let payload = shallowPayload(b.payload);
  const merge = ["runId", "taskId", "decision", "level", "reason"];
  for (const k of merge) {
    if (b[k] != null && payload[k] === undefined) {
      const val = b[k];
      if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
        payload[k] = val;
      } else if (val != null && typeof val === "object") {
        payload[k] = val;
      }
    }
  }
  for (const k of ["userId", "user_id", "auditId", "id", "market", "locale", "product", "createdAt"]) {
    if (Object.prototype.hasOwnProperty.call(payload, k)) delete payload[k];
  }
  return { eventType, payload };
}

/**
 * 单行 → API 契约
 * @param {unknown} row
 */
function normalizeAuditEventRecord(row) {
  if (!row || typeof row !== "object") return null;
  const r = row;
  const auditId =
    r.auditId != null
      ? String(r.auditId).trim()
      : r.id != null
        ? String(r.id).trim()
        : "";
  const userId =
    r.userId != null ? String(r.userId).trim() : r.user_id != null ? String(r.user_id).trim() : "";
  const eventType =
    r.eventType != null
      ? String(r.eventType).trim()
      : r.event_type != null
        ? String(r.event_type).trim()
        : "";
  if (!auditId || !userId || !eventType) return null;
  let payload = {};
  const rawP = r.payload;
  if (rawP != null && typeof rawP === "object" && !Array.isArray(rawP)) {
    payload = shallowPayload(rawP);
  }
  const createdAt =
    r.createdAt != null
      ? String(r.createdAt)
      : r.created_at != null
        ? String(r.created_at)
        : "";
  const market = r.market != null ? String(r.market) : "global";
  const locale = r.locale != null ? String(r.locale) : "en-US";
  const product = r.product != null ? String(r.product) : "aics";
  return { auditId, userId, eventType, payload, createdAt, market, locale, product };
}

module.exports = {
  normalizeAuditAppendPayload,
  normalizeAuditEventRecord,
  MAX_EVENT_TYPE_LEN,
  MAX_PAYLOAD_JSON_CHARS
};
