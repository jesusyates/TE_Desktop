/**
 * D-7-3N / D-7-3Q：TaskResult 落盘载荷 + 内容 hash。
 * MODULE C-5：与 coreRecordFields 对齐 userId / clientId / runId / prompt / createdAt / mode / stepCount / success。
 */
const { normalizeCoreRecordFields } = require("./coreRecordFields");
const { hashResultContent } = require("./contentHash");

/**
 * @param {{ userId: string; clientId: string; sessionToken?: string }} ctx
 * @param {object} body
 */
function normalizeResultPersistPayload(ctx, body) {
  const b = body && typeof body === "object" ? body : {};
  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  const createdAt = new Date().toISOString();
  const result = b.result && typeof b.result === "object" ? b.result : {};
  const kind = typeof result.kind === "string" ? result.kind : "";
  let mode = "unknown";
  if (kind === "content") mode = "content";
  else if (kind === "computer") mode = "automation";
  let stepCount;
  if (typeof b.stepCount === "number" && Number.isFinite(b.stepCount)) stepCount = b.stepCount;
  else if (typeof result.stepCount === "number" && Number.isFinite(result.stepCount)) stepCount = result.stepCount;
  const runId = b.runId != null && String(b.runId).trim() !== "" ? String(b.runId).trim() : "";
  const base = normalizeCoreRecordFields(ctx, {
    runId,
    prompt,
    createdAt,
    success: true,
    mode,
    ...(stepCount != null ? { stepCount } : {})
  });
  const payload = {
    ...base,
    result: b.result,
    hash: hashResultContent(prompt, b.result)
  };
  if (b.stepResults && typeof b.stepResults === "object") {
    payload.stepResults = b.stepResults;
  }
  return payload;
}

module.exports = { normalizeResultPersistPayload };
