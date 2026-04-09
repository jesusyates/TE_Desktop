/**
 * D-7-3L / D-3：Memory 读路径 — 旧 list/snapshot 保留；正式查询走 listMemoryFormal / getMemoryDetailForUser。
 */
const {
  listRecentMemoryRecords,
  getMemorySnapshot,
  getAllUserMemoryRows,
  findMemoryRowByIdForUser
} = require("../memoryStore");
const {
  deriveMemoryType,
  rowIsActive,
  toMemoryListItemVm,
  toMemoryDetailVm,
  parseIsActiveFilter
} = require("./memoryQueryNormalize");

const LIST_DEFAULT = 50;
const LIST_MAX = 200;
const SNAPSHOT_DEFAULT = 100;
const SNAPSHOT_MAX = 200;

function clampMemoryListLimit(rawQuery) {
  const n = parseInt(rawQuery || String(LIST_DEFAULT), 10);
  const v = Number.isFinite(n) && n > 0 ? n : LIST_DEFAULT;
  return Math.min(LIST_MAX, Math.max(1, v));
}

function clampMemorySnapshotLimit(rawQuery) {
  const n = parseInt(rawQuery || String(SNAPSHOT_DEFAULT), 10);
  const v = Number.isFinite(n) && n > 0 ? n : SNAPSHOT_DEFAULT;
  return Math.min(SNAPSHOT_MAX, Math.max(1, v));
}

/**
 * GET /memory-records
 * @param {string} userId
 * @param {string | null} limitQuery
 */
function listRecords(userId, limitQuery) {
  const lim = clampMemoryListLimit(limitQuery);
  return listRecentMemoryRecords(lim, userId);
}

/**
 * GET /memory-records/snapshot
 * @param {string} userId
 * @param {string | null} limitQuery
 */
function snapshot(userId, limitQuery) {
  const lim = clampMemorySnapshotLimit(limitQuery);
  return getMemorySnapshot(lim, userId);
}

const PAGE_DEFAULT = 1;
const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

function clampFormalPage(n) {
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : PAGE_DEFAULT;
}

function clampFormalPageSize(n) {
  const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : PAGE_SIZE_DEFAULT;
  return Math.min(PAGE_SIZE_MAX, Math.max(1, v));
}

/**
 * GET /memory/list
 * @param {string} userId
 * @param {URLSearchParams} searchParams
 */
function listMemoryFormal(userId, searchParams) {
  const sp = searchParams || new URLSearchParams();
  const page = clampFormalPage(parseInt(sp.get("page") || String(PAGE_DEFAULT), 10));
  const pageSize = clampFormalPageSize(parseInt(sp.get("pageSize") || String(PAGE_SIZE_DEFAULT), 10));
  const memoryTypeRaw = sp.get("memoryType");
  const memoryTypeFilter = memoryTypeRaw != null ? String(memoryTypeRaw).trim() : "";
  const isActiveMode = parseIsActiveFilter(sp.get("isActive"));

  let rows = getAllUserMemoryRows(userId);
  rows = rows.filter((r) => {
    if (isActiveMode === "active_only" && !rowIsActive(r)) return false;
    if (isActiveMode === "inactive_only" && rowIsActive(r)) return false;
    if (memoryTypeFilter && deriveMemoryType(r) !== memoryTypeFilter) return false;
    return true;
  });

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const slice = rows.slice(start, start + pageSize);
  const list = slice.map((r) => toMemoryListItemVm(r));
  return { list, total, page, pageSize };
}

/**
 * GET /memory/:id
 * @param {string} userId
 * @param {string} memoryId
 */
function getMemoryDetailForUser(userId, memoryId) {
  const row = findMemoryRowByIdForUser(userId, memoryId);
  if (!row) return null;
  return toMemoryDetailVm(row);
}

module.exports = {
  listRecords,
  snapshot,
  listMemoryFormal,
  getMemoryDetailForUser,
  LIST_DEFAULT,
  LIST_MAX,
  SNAPSHOT_DEFAULT,
  SNAPSHOT_MAX,
  PAGE_SIZE_MAX
};
