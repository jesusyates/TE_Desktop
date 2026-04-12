/**
 * v1 审计：写入 / 列表（仅当前登录 userId）
 */
const { randomUUID } = require("crypto");
const { AppError } = require("../../utils/AppError");
const { logger } = require("../../infra/logger");
const { getAuditStore } = require("../../stores/registry");
const { getStorageDimensions } = require("../../infra/context-dimensions");
const {
  normalizeAuditAppendPayload,
  normalizeAuditEventRecord
} = require("../../schemas/audit-event.schema");

/**
 * @param {import('express').Request['context']} ctx
 * @returns {string}
 */
function requireAuthenticatedUserId(ctx) {
  const uid = ctx && ctx.userId != null ? String(ctx.userId).trim() : "";
  if (!uid) {
    throw new AppError("UNAUTHORIZED", "Authentication required", 401);
  }
  return uid;
}

/**
 * @param {import('express').Request['context']} ctx
 * @param {object} body
 */
async function appendAuditEvent(ctx, body) {
  const requestId = ctx && ctx.requestId ? String(ctx.requestId) : null;
  const uid = requireAuthenticatedUserId(ctx);
  const dims = getStorageDimensions(ctx);
  const { eventType, payload } = normalizeAuditAppendPayload(body);
  if (!eventType) {
    throw new AppError("VALIDATION_ERROR", "eventType is required", 400);
  }

  const row = {
    auditId: `aud_${randomUUID()}`,
    userId: uid,
    eventType,
    payload,
    market: dims.market,
    locale: dims.locale,
    product: dims.product,
    createdAt: new Date().toISOString()
  };

  const t0 = Date.now();
  try {
    const store = getAuditStore();
    const created = await store.create(row, requestId);
    const api = normalizeAuditEventRecord(created) || created;
    logger.info({
      event: "audit_event_written",
      requestId,
      userId: uid,
      auditId: api.auditId,
      eventType: api.eventType,
      market: api.market,
      locale: api.locale,
      product: api.product,
      success: true,
      durationMs: Date.now() - t0
    });
    return api;
  } catch (e) {
    logger.warn({
      event: "audit_event_write_failed",
      requestId,
      userId: uid,
      market: dims.market,
      locale: dims.locale,
      product: dims.product,
      error: e instanceof Error ? e.message : String(e),
      success: false,
      durationMs: Date.now() - t0
    });
    throw new AppError(
      "AUDIT_WRITE_FAILED",
      e instanceof Error ? e.message : "audit write failed",
      500
    );
  }
}

/**
 * @param {import('express').Request['context']} ctx
 * @param {import('express').Request['query']} query
 */
async function listAuditEventsForApi(ctx, query) {
  const requestId = ctx && ctx.requestId ? String(ctx.requestId) : null;
  const uid = requireAuthenticatedUserId(ctx);
  const dims = getStorageDimensions(ctx);
  const limitRaw = query && query.limit != null ? Number(query.limit) : 50;
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));

  const t0 = Date.now();
  try {
    const store = getAuditStore();
    const rows = await store.listByUser(uid, limit, requestId);
    const items = (rows || []).map((r) => normalizeAuditEventRecord(r)).filter(Boolean);
    logger.info({
      event: "audit_events_listed",
      requestId,
      userId: uid,
      market: dims.market,
      locale: dims.locale,
      product: dims.product,
      count: items.length,
      limit,
      durationMs: Date.now() - t0
    });
    return items;
  } catch (e) {
    logger.warn({
      event: "audit_events_list_failed",
      requestId,
      userId: uid,
      market: dims.market,
      locale: dims.locale,
      product: dims.product,
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - t0
    });
    throw new AppError(
      "AUDIT_LIST_FAILED",
      e instanceof Error ? e.message : "audit list failed",
      500
    );
  }
}

module.exports = { appendAuditEvent, listAuditEventsForApi };
