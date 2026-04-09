/**
 * D-7-3N：POST /task ingress 载荷（identity + prompt + 统一 createdAt；receivedAt 仍由 store 写入）。
 * MODULE C-5：identity 时间字段与 coreRecordFields 一致。
 */
const { normalizeCoreRecordFields } = require("./coreRecordFields");

/**
 * @param {{ userId: string; clientId: string; sessionToken?: string }} ctx
 * @param {object} body
 * @returns {{ identity: object; body: { prompt: string } }}
 */
function normalizeTaskIngressForWrite(ctx, body) {
  const safeBody = body && typeof body === "object" ? body : {};
  const base = normalizeCoreRecordFields(ctx, {
    prompt: "",
    runId: "",
    mode: "task_ingress",
    success: true,
    createdAt: new Date().toISOString()
  });
  const identity = {
    userId: base.userId,
    clientId: base.clientId,
    ...(base.sessionToken ? { sessionToken: base.sessionToken } : {}),
    createdAt: base.createdAt
  };
  const prompt = typeof safeBody.prompt === "string" ? safeBody.prompt : "";
  return { identity, body: { prompt } };
}

module.exports = { normalizeTaskIngressForWrite };
