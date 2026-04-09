/**
 * D-7-3Q / D-7-3R：SHA-256 封装；字段规则见 shared/contentHashSpec.ts（Node 侧 require 其 CJS 编译产物）。
 */
const crypto = require("crypto");
const {
  buildResultHashPayloadObject,
  buildMemoryHashPayloadObject,
  canonicalTaskResultForHash
} = require("../../shared/dist-node/contentHashSpec.js");

function sha256HexUtf8(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * @param {string} prompt
 * @param {unknown} result
 */
function hashResultContent(prompt, result) {
  return sha256HexUtf8(JSON.stringify(buildResultHashPayloadObject(prompt, result)));
}

/**
 * @param {{
 *   prompt?: string;
 *   requestedMode?: unknown;
 *   resolvedMode?: unknown;
 *   intent?: unknown;
 *   resultKind?: unknown;
 *   capabilityIds?: unknown;
 *   success?: unknown;
 * }} fields
 */
function hashMemoryRecordContent(fields) {
  return sha256HexUtf8(JSON.stringify(buildMemoryHashPayloadObject(fields)));
}

module.exports = {
  hashResultContent,
  hashMemoryRecordContent,
  canonicalTaskResultForHash
};
