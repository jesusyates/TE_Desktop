/**
 * D-7-3M：POST /result 落盘收口（身份合并 + resultStore）。
 * 调用前须由 HTTP 层完成 prompt / result 校验。
 */
const { saveTaskResult } = require("../resultStore");
const { normalizeResultPersistPayload } = require("../schema/resultSchema");

/**
 * @param {{ userId: string; clientId: string; sessionToken?: string }} ctx
 * @param {object} body — 已校验含 prompt、result
 */
function persistValidatedResult(ctx, body) {
  saveTaskResult(normalizeResultPersistPayload(ctx, body));
}

module.exports = { persistValidatedResult };
