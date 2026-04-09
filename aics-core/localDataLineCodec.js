/**
 * D-7-3T：JSONL 行级编解码。新行写入 Base64(UTF-8 JSON)；兼容旧版明文 JSON 行。
 * 坏行 skip + console.warn；不碰 record 内 hash 等字段。
 */

function encodeJsonlLine(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
}

/**
 * @param {string} line
 * @param {string} tag
 * @returns {object|null}
 */
function decodeJsonlLine(line, tag) {
  const t = String(line ?? "").trim();
  if (!t) return null;
  try {
    if (t.startsWith("{") || t.startsWith("[")) {
      return JSON.parse(t);
    }
    const json = Buffer.from(t, "base64").toString("utf8");
    return JSON.parse(json);
  } catch (e) {
    console.warn(`[D-7-3T] ${tag} skip bad JSONL line:`, e?.message || e);
    return null;
  }
}

module.exports = { encodeJsonlLine, decodeJsonlLine };
