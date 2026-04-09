/**
 * D-7-3M：POST /memory-record 落盘收口。
 * 调用前须由 HTTP 层完成 prompt 校验。
 */
const { recordMemory } = require("../memoryStore");
const { normalizeMemoryPersistPayload } = require("../schema/memorySchema");

/**
 * @param {{ userId: string; clientId: string; sessionToken?: string }} ctx
 * @param {object} body
 */
function persistMemoryRecord(ctx, body) {
  recordMemory(normalizeMemoryPersistPayload(ctx, body));
}

module.exports = { persistMemoryRecord };
