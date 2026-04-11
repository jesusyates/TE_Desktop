/**
 * Result 记录（run 结果快照，独立于 task 行）。
 */

function toIso(v) {
  if (v == null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizeResultRecord(r) {
  if (!r) return null;
  let result = r.result;
  if (typeof result === "string") {
    try {
      result = JSON.parse(result);
    } catch {
      result = { raw: result };
    }
  }
  const runId =
    r.runId != null
      ? String(r.runId)
      : r.run_id != null
        ? String(r.run_id)
        : r.id != null
          ? String(r.id)
          : "";
  const success =
    r.success === true || r.success === 1 || String(r.success).toLowerCase() === "true";
  const created = toIso(r.created_at ?? r.createdAt) || new Date().toISOString();
  const updated = toIso(r.updated_at ?? r.updatedAt) || created;
  const market = r.market != null ? String(r.market) : "global";
  const locale = r.locale != null ? String(r.locale) : "en-US";
  const product = r.product != null ? String(r.product) : "aics";
  return {
    runId,
    taskId: r.taskId != null ? String(r.taskId) : r.task_id != null ? String(r.task_id) : "",
    userId: r.userId != null ? String(r.userId) : r.user_id != null ? String(r.user_id) : "",
    result: result != null && typeof result === "object" ? result : {},
    resultSourceType:
      r.resultSourceType != null
        ? String(r.resultSourceType)
        : r.result_source_type != null
          ? String(r.result_source_type)
          : "mock",
    success: Boolean(success),
    market,
    locale,
    product,
    createdAt: created,
    updatedAt: updated
  };
}

module.exports = { normalizeResultRecord };
