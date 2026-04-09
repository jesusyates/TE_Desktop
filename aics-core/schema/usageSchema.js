/**
 * D-7-3N：Usage 记录字段推导（与 D-7-3K 规则一致：mode / success / stepCount / createdAt）。
 * MODULE C-5：字段经 normalizeCoreRecordFields 收口。
 */
const { normalizeCoreRecordFields } = require("./coreRecordFields");

/**
 * @param {object} body — /result 请求体（须含 result）
 * @param {{ userId: string; clientId: string; sessionToken?: string }} ctx
 */
function normalizeUsageFromResultBody(body, ctx) {
  const b = body && typeof body === "object" ? body : {};
  const result = b.result && typeof b.result === "object" ? b.result : {};
  const kind = typeof result.kind === "string" ? result.kind : "";

  let mode = "unknown";
  if (b.usageMode === "content" || b.usageMode === "automation") mode = b.usageMode;
  else if (b.mode === "content" || b.mode === "automation") mode = b.mode;
  else if (kind === "content") mode = "content";
  else if (kind === "computer") mode = "automation";

  let stepCount;
  if (typeof b.stepCount === "number" && Number.isFinite(b.stepCount)) stepCount = b.stepCount;
  else if (typeof result.stepCount === "number" && Number.isFinite(result.stepCount)) stepCount = result.stepCount;

  const success =
    typeof b.success === "boolean"
      ? b.success
      : typeof result.metadata === "object" &&
          result.metadata &&
          typeof result.metadata.success === "boolean"
        ? result.metadata.success
        : true;

  const runId = b.runId != null && String(b.runId).trim() !== "" ? String(b.runId).trim() : "";
  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";

  const partial = { runId, prompt, mode, success, createdAt: new Date().toISOString() };
  if (stepCount != null) partial.stepCount = stepCount;
  return normalizeCoreRecordFields(ctx, partial);
}

module.exports = { normalizeUsageFromResultBody };
