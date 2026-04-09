/**
 * D-3：Memory 查询 ViewModel — 旧 JSONL 行映射为正式对外契约；禁止把原始 row 透出给 HTTP。
 */
const { MEMORY_TYPES } = require("../schema/memorySchema");

function rowTimeMs(row) {
  const t = row.recordedAt || row.createdAt || "";
  const n = new Date(t).getTime();
  return Number.isFinite(n) ? n : 0;
}

function deriveMemoryType(row) {
  const raw = row.memoryType != null ? String(row.memoryType).trim() : "";
  if (raw && MEMORY_TYPES.has(raw)) return raw;
  if (raw) return raw;
  return "successful_task_hint";
}

function deriveKey(row) {
  if (row.key != null && String(row.key).trim()) return String(row.key).trim().slice(0, 256);
  const intent = typeof row.intent === "string" ? row.intent.trim() : "run";
  return `hint:${intent.slice(0, 120)}`;
}

function deriveValuePreview(row, maxLen = 160) {
  if (row.value != null && String(row.value).trim()) {
    const vs = String(row.value);
    return vs.length > maxLen ? `${vs.slice(0, maxLen - 1)}…` : vs;
  }
  const intent = typeof row.intent === "string" ? row.intent.trim() : "";
  const rm = typeof row.resolvedMode === "string" ? row.resolvedMode.trim() : "";
  const caps = Array.isArray(row.capabilityIds) ? row.capabilityIds.map(String).slice(0, 6).join(",") : "";
  const blob = [intent, rm, caps].filter(Boolean).join(" · ");
  const p = typeof row.prompt === "string" ? row.prompt.trim().slice(0, 100) : "";
  const s = blob || p || "memory";
  return s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
}

function deriveMemoryId(row) {
  if (row.memoryId != null && String(row.memoryId).trim()) return String(row.memoryId).trim();
  if (row.id != null && String(row.id).trim()) return String(row.id).trim();
  const createdAt = row.recordedAt || row.createdAt || "";
  return `mem:${createdAt}:${String(row.prompt ?? "").slice(0, 24)}`;
}

function deriveSource(row) {
  const s = row.source != null ? String(row.source).trim() : "";
  if (["task", "result", "template", "preference"].includes(s)) return s;
  return "task";
}

function deriveSourceId(row) {
  if (row.sourceId != null && String(row.sourceId).trim()) return String(row.sourceId).trim().slice(0, 512);
  if (row.planId != null && String(row.planId).trim()) return String(row.planId).trim().slice(0, 512);
  return "";
}

function rowIsActive(row) {
  if (typeof row.isActive === "boolean") return row.isActive;
  return true;
}

function toTimestamps(row) {
  const createdAt = row.recordedAt || row.createdAt || "";
  const updatedAt = row.updatedAt || row.recordedAt || row.createdAt || "";
  return { createdAt, updatedAt };
}

/**
 * @param {object} row — 存储原始行（内部）
 * @returns {object} 列表项 VM
 */
function toMemoryListItemVm(row) {
  const { createdAt, updatedAt } = toTimestamps(row);
  return {
    memoryId: deriveMemoryId(row),
    memoryType: deriveMemoryType(row),
    key: deriveKey(row),
    valuePreview: deriveValuePreview(row),
    source: deriveSource(row),
    sourceId: deriveSourceId(row),
    createdAt,
    updatedAt,
    isActive: rowIsActive(row)
  };
}

/**
 * @param {object} row
 * @returns {object} 单条详情 VM
 */
function toMemoryDetailVm(row) {
  const base = toMemoryListItemVm(row);
  let value = "";
  if (row.value != null) {
    value = typeof row.value === "string" ? row.value : stableJson(row.value);
  } else {
    value = deriveValuePreview(row, 8000);
  }
  const max = 8000;
  if (value.length > max) value = `${value.slice(0, max - 1)}…`;
  return {
    ...base,
    value
  };
}

function stableJson(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}

/**
 * @param {string | null | undefined} raw
 * @returns {'active_only'|'inactive_only'|'all'}
 */
function parseIsActiveFilter(raw) {
  if (raw == null || String(raw).trim() === "") return "active_only";
  const s = String(raw).trim().toLowerCase();
  if (s === "all" || s === "*") return "all";
  if (s === "false" || s === "0") return "inactive_only";
  return "active_only";
}

module.exports = {
  rowTimeMs,
  deriveMemoryId,
  deriveMemoryType,
  deriveKey,
  deriveValuePreview,
  rowIsActive,
  toMemoryListItemVm,
  toMemoryDetailVm,
  parseIsActiveFilter
};
