/**
 * History 列表项 / 详情（用户可浏览的执行摘要）。
 */

function toIso(v) {
  if (v == null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function clipSummary(text, max = 400) {
  const t = String(text || "").trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function normalizeHistoryRecord(r) {
  if (!r) return null;
  const created = toIso(r.created_at ?? r.createdAt) || new Date().toISOString();
  const updated = toIso(r.updated_at ?? r.updatedAt) || created;
  const historyId =
    r.historyId != null
      ? String(r.historyId)
      : r.id != null
        ? String(r.id)
        : r.history_id != null
          ? String(r.history_id)
          : "";
  let summary =
    r.summary != null
      ? String(r.summary)
      : r.prompt != null
        ? clipSummary(String(r.prompt), 400)
        : "";
  if (!summary && r.result && typeof r.result === "object" && r.result.summary != null) {
    summary = clipSummary(String(r.result.summary), 400);
  }
  const market = r.market != null ? String(r.market) : "global";
  const locale = r.locale != null ? String(r.locale) : "en-US";
  const product = r.product != null ? String(r.product) : "aics";
  return {
    historyId,
    taskId: r.taskId != null ? String(r.taskId) : r.task_id != null ? String(r.task_id) : "",
    runId: r.runId != null ? String(r.runId) : r.run_id != null ? String(r.run_id) : "",
    userId: r.userId != null ? String(r.userId) : r.user_id != null ? String(r.user_id) : "",
    prompt: r.prompt != null ? String(r.prompt) : "",
    status: r.status != null ? String(r.status) : "success",
    resultSourceType:
      r.resultSourceType != null
        ? String(r.resultSourceType)
        : r.result_source_type != null
          ? String(r.result_source_type)
          : "mock",
    summary,
    market,
    locale,
    product,
    createdAt: created,
    updatedAt: updated
  };
}

module.exports = { normalizeHistoryRecord, clipSummary };
