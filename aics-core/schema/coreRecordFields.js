/**
 * MODULE C-5：读写记录公共字段（须经 Route ctx 注入 identity，禁止 service 自拼 userId）。
 */
const { normalizeIdentityWrite } = require("./identityFields");

/**
 * @param {{ userId?: string; clientId?: string; sessionToken?: string }} ctx — buildRouteContext 产物
 * @param {object} partial — runId / prompt / createdAt / success / mode / stepCount
 */
function normalizeCoreRecordFields(ctx, partial) {
  const id = normalizeIdentityWrite(ctx);
  const p = partial && typeof partial === "object" ? partial : {};
  const runId = p.runId != null && String(p.runId).trim() ? String(p.runId).trim() : "";
  const prompt = typeof p.prompt === "string" ? p.prompt.trim() : "";
  const createdAt =
    typeof p.createdAt === "string" && p.createdAt.trim() ? p.createdAt.trim() : new Date().toISOString();
  const out = {
    userId: id.userId,
    clientId: id.clientId,
    ...(id.sessionToken ? { sessionToken: id.sessionToken } : {}),
    runId,
    prompt,
    createdAt,
    success: typeof p.success === "boolean" ? p.success : true,
    mode: typeof p.mode === "string" && p.mode.trim() ? p.mode.trim() : "unknown"
  };
  if (typeof p.stepCount === "number" && Number.isFinite(p.stepCount)) {
    out.stepCount = p.stepCount;
  }
  return out;
}

module.exports = { normalizeCoreRecordFields };
