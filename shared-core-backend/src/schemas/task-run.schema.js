/**
 * Task run 持久化 / API 形状
 */

function normalizeRunRecord(r) {
  if (!r) return null;
  let steps = [];
  if (Array.isArray(r.steps)) steps = r.steps;
  else if (typeof r.steps === "string") {
    try {
      const p = JSON.parse(r.steps);
      steps = Array.isArray(p) ? p : [];
    } catch {
      steps = [];
    }
  }
  let result = r.result ?? null;
  if (typeof result === "string") {
    try {
      result = JSON.parse(result);
    } catch {
      result = { raw: result };
    }
  }
  const created = r.created_at != null ? String(r.created_at) : r.createdAt != null ? String(r.createdAt) : null;
  const updated = r.updated_at != null ? String(r.updated_at) : r.updatedAt != null ? String(r.updatedAt) : created;
  let templateSuggestion = null;
  if (r.template_suggestion !== undefined && r.template_suggestion !== null) {
    templateSuggestion = r.template_suggestion;
  } else if (r.templateSuggestion !== undefined && r.templateSuggestion !== null) {
    templateSuggestion = r.templateSuggestion;
  }
  const market =
    r.market != null ? String(r.market) : r._market != null ? String(r._market) : "global";
  const locale =
    r.locale != null ? String(r.locale) : r._locale != null ? String(r._locale) : "en-US";
  const product =
    r.product != null ? String(r.product) : r._product != null ? String(r._product) : "aics";
  return {
    runId: r.id != null ? String(r.id) : r.runId != null ? String(r.runId) : "",
    taskId: r.task_id != null ? String(r.task_id) : r.taskId != null ? String(r.taskId) : "",
    userId: r.user_id != null ? String(r.user_id) : r.userId != null ? String(r.userId) : "",
    status: r.status != null ? String(r.status) : "pending",
    steps,
    result,
    resultSourceType:
      r.result_source_type != null
        ? String(r.result_source_type)
        : r.resultSourceType != null
          ? String(r.resultSourceType)
          : "mock",
    templateSuggestion,
    market,
    locale,
    product,
    createdAt: created,
    updatedAt: updated
  };
}

module.exports = { normalizeRunRecord };
