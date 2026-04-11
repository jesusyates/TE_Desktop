/**
 * AICS 资产 Memory（非 history / result日志）。
 */

function normalizeMemoryRecord(row) {
  if (!row || typeof row !== "object") return null;
  const id = row.memoryId != null ? String(row.memoryId) : row.id != null ? String(row.id) : "";
  const type = row.type != null ? String(row.type) : "pattern";
  const summary = row.summary != null ? String(row.summary).slice(0, 2000) : "";
  const createdAt =
    row.createdAt != null
      ? String(row.createdAt)
      : row.created_at != null
        ? String(row.created_at)
        : "";
  const market = row.market != null ? String(row.market) : "global";
  const locale = row.locale != null ? String(row.locale) : "en-US";
  const product = row.product != null ? String(row.product) : "aics";
  return { memoryId: id, type, summary, createdAt, market, locale, product };
}

module.exports = { normalizeMemoryRecord };
