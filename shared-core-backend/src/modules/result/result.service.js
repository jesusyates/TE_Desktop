/**
 * Result 读取（run 结果快照）。
 */
const { getResultStore } = require("../../stores/registry");
const { userKey } = require("../../schemas/domain-stores.schema");
const { AppError } = require("../../utils/AppError");

/**
 * @param {import('express').Request['context']} ctx
 * @param {string} runId
 */
async function getResultByRunId(ctx, runId) {
  const userId = userKey(ctx);
  const requestId = ctx && ctx.requestId ? String(ctx.requestId) : null;
  const rid = String(runId || "").trim();
  if (!rid) {
    throw new AppError("VALIDATION_ERROR", "runId is required", 400);
  }
  const rec = await getResultStore().getByRunId(rid, requestId);
  if (!rec || !rec.runId) {
    throw new AppError("RESULT_NOT_FOUND", "Result not found", 404);
  }
  if (String(rec.userId) !== String(userId)) {
    throw new AppError("FORBIDDEN", "Result access denied", 403);
  }
  return rec;
}

module.exports = { getResultByRunId };
