/**
 * History正式路径（执行沉淀列表 / 详情）。
 */
const { getHistoryStore } = require("../../stores/registry");
const { userKey } = require("../../schemas/domain-stores.schema");
const { AppError } = require("../../utils/AppError");

/**
 * @param {import('express').Request['context']} ctx
 * @param {Record<string, unknown>} query
 */
async function listHistory(ctx, query) {
  const userId = userKey(ctx);
  const requestId = ctx && ctx.requestId ? String(ctx.requestId) : null;
  const q = query && typeof query === "object" ? query : {};
  const page = Math.max(1, parseInt(String(q.page || "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(q.limit || q.pageSize || "20"), 10) || 20));
  return getHistoryStore().listByUser(userId, { page, limit }, requestId);
}

/**
 * @param {import('express').Request['context']} ctx
 * @param {string} historyId
 */
async function getHistoryById(ctx, historyId) {
  const userId = userKey(ctx);
  const requestId = ctx && ctx.requestId ? String(ctx.requestId) : null;
  const hid = String(historyId || "").trim();
  if (!hid) {
    throw new AppError("VALIDATION_ERROR", "history id is required", 400);
  }
  const rec = await getHistoryStore().getById(hid, requestId);
  if (!rec || !rec.historyId) {
    throw new AppError("HISTORY_NOT_FOUND", "History not found", 404);
  }
  if (String(rec.userId) !== String(userId)) {
    throw new AppError("FORBIDDEN", "History access denied", 403);
  }
  return rec;
}

/**
 * @param {import('express').Request['context']} ctx
 * @param {string} historyId
 */
async function deleteHistoryEntry(ctx, historyId) {
  const userId = userKey(ctx);
  const requestId = ctx && ctx.requestId ? String(ctx.requestId) : null;
  const hid = String(historyId || "").trim();
  if (!hid) {
    throw new AppError("VALIDATION_ERROR", "history id is required", 400);
  }
  const ok = await getHistoryStore().deleteById(hid, userId, requestId);
  if (!ok) {
    throw new AppError("HISTORY_NOT_FOUND", "History not found", 404);
  }
  return { deleted: true };
}

module.exports = { listHistory, getHistoryById, deleteHistoryEntry };
