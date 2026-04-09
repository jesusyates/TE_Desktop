/**
 * D-7-3G/I + D-7-3J：Memory JSONL + 内存；按 userId 隔离。
 */
const fs = require("fs");
const path = require("path");
const { resolveCoreDataDir } = require("./resolveCoreDataDir");
const { encodeJsonlLine, decodeJsonlLine } = require("./localDataLineCodec");

const DATA_DIR = resolveCoreDataDir();
const MEMORY_FILE = path.join(DATA_DIR, "memory-records.jsonl");

const snapshotBuffer = [];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readAllRowsFromDisk() {
  if (!fs.existsSync(MEMORY_FILE)) return [];
  let raw;
  try {
    raw = fs.readFileSync(MEMORY_FILE, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split(/\n/).filter((l) => l.trim());
  const rows = [];
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line));
    } catch {
      /* skip */
    }
  }
  return rows;
}

function rowUserId(row) {
  const u = row.userId;
  if (u != null && String(u).trim() !== "") return String(u).trim();
  return "dev-user";
}

function rowDedupeKey(row) {
  const t = row.recordedAt || row.createdAt || "";
  return `${rowUserId(row)}::${t}::${String(row.prompt ?? "").slice(0, 80)}`;
}

/**
 * D-3：该用户全部 memory 行（磁盘 + 缓冲），按时间降序；不分页、不去重键（每行一条归档）。
 * @param {string} userId
 */
function getAllUserMemoryRows(userId) {
  const uid = String(userId ?? "").trim() || "dev-user";
  const disk = readAllRowsFromDisk();
  const combined = [...disk, ...snapshotBuffer];
  const rows = [];
  for (const row of combined) {
    if (!row || typeof row !== "object") continue;
    if (rowUserId(row) !== uid) continue;
    rows.push(row);
  }
  rows.sort((a, b) => {
    const ta = new Date(a.recordedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.recordedAt || b.createdAt || 0).getTime();
    return tb - ta;
  });
  return rows;
}

function deriveMemoryIdLocal(row) {
  if (row.memoryId != null && String(row.memoryId).trim()) return String(row.memoryId).trim();
  if (row.id != null && String(row.id).trim()) return String(row.id).trim();
  const createdAt = row.recordedAt || row.createdAt || "";
  return `mem:${createdAt}:${String(row.prompt ?? "").slice(0, 24)}`;
}

/**
 * @param {string} userId
 * @param {string} memoryId
 * @returns {object | null}
 */
function findMemoryRowByIdForUser(userId, memoryId) {
  const target = String(memoryId ?? "").trim();
  if (!target) return null;
  const rows = getAllUserMemoryRows(userId);
  for (const r of rows) {
    if (deriveMemoryIdLocal(r) === target) return r;
  }
  return null;
}

function mergeRowsSorted(limit, userId) {
  const uid = String(userId ?? "").trim() || "dev-user";
  const disk = readAllRowsFromDisk();
  const combined = [...disk, ...snapshotBuffer];
  const best = new Map();
  for (const row of combined) {
    if (!row || typeof row !== "object") continue;
    if (rowUserId(row) !== uid) continue;
    const k = rowDedupeKey(row);
    const prev = best.get(k);
    const ts = new Date(row.recordedAt || row.createdAt || 0).getTime();
    if (!prev || new Date(prev.recordedAt || prev.createdAt || 0).getTime() <= ts) best.set(k, row);
  }
  const arr = Array.from(best.values());
  arr.sort(
    (a, b) =>
      new Date(b.recordedAt || b.createdAt || 0) - new Date(a.recordedAt || a.createdAt || 0)
  );
  return arr.slice(0, Math.max(1, Math.min(limit, 200)));
}

function normalizeMemoryItem(row) {
  const createdAt = row.recordedAt || row.createdAt || "";
  const id =
    row.memoryId != null && String(row.memoryId).trim()
      ? String(row.memoryId).trim()
      : row.id || `mem:${createdAt}:${String(row.prompt ?? "").slice(0, 24)}`;
  const base = {
    id,
    prompt: String(row.prompt ?? ""),
    requestedMode: row.requestedMode != null ? String(row.requestedMode) : "",
    resolvedMode: row.resolvedMode != null ? String(row.resolvedMode) : "",
    intent: row.intent != null ? String(row.intent) : "",
    planId: row.planId != null && row.planId !== "" ? String(row.planId) : null,
    createdAt,
    capabilityIds: Array.isArray(row.capabilityIds) ? row.capabilityIds.map(String) : [],
    success: typeof row.success === "boolean" ? row.success : undefined
  };
  /** D-2 列表形态（查询在 D-3 扩展） */
  if (row.memoryType != null && String(row.memoryType).trim()) {
    base.memoryType = String(row.memoryType).trim();
  }
  if (row.key != null && String(row.key).trim()) {
    base.key = String(row.key).trim();
  }
  if (row.value != null && String(row.value).trim()) {
    const vs = String(row.value);
    base.valuePreview = vs.length > 160 ? `${vs.slice(0, 157)}…` : vs;
  }
  if (row.source != null && String(row.source).trim()) {
    base.source = String(row.source).trim();
  }
  if (typeof row.hash === "string" && row.hash.trim() !== "") {
    return { ...base, hash: row.hash.trim() };
  }
  return base;
}

/**
 * @param {object} payload
 */
function recordMemory(payload) {
  ensureDataDir();
  const row = {
    recordedAt: new Date().toISOString(),
    ...payload
  };
  snapshotBuffer.push(row);
  if (snapshotBuffer.length > 1000) snapshotBuffer.shift();
  const line = `${encodeJsonlLine(row)}\n`;
  fs.appendFileSync(MEMORY_FILE, line, "utf8");
  return { ok: true };
}

/**
 * H-2：按 memoryId 物理删除该用户归档行（JSONL 重写 + 缓冲剔除）。
 * 保留无法解析的原始行，避免误删。
 * @param {string} userId
 * @param {string} memoryId
 * @returns {{ ok: boolean; message?: string }}
 */
function deleteMemoryForUser(userId, memoryId) {
  ensureDataDir();
  const uid = String(userId ?? "").trim() || "dev-user";
  const target = String(memoryId ?? "").trim();
  if (!target) {
    return { ok: false, message: "invalid memory id" };
  }

  const rawLines = fs.existsSync(MEMORY_FILE)
    ? fs.readFileSync(MEMORY_FILE, "utf8").split(/\n").filter((l) => l.trim())
    : [];
  const keptLines = [];
  let removed = 0;
  for (const line of rawLines) {
    const row =
      decodeJsonlLine(line, "memory-delete-scan") ||
      (() => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })();
    if (!row || typeof row !== "object") {
      keptLines.push(line);
      continue;
    }
    if (rowUserId(row) === uid && deriveMemoryIdLocal(row) === target) {
      removed += 1;
      continue;
    }
    keptLines.push(line);
  }
  fs.writeFileSync(MEMORY_FILE, keptLines.length ? `${keptLines.join("\n")}\n` : "", "utf8");

  for (let i = snapshotBuffer.length - 1; i >= 0; i--) {
    const row = snapshotBuffer[i];
    if (
      row &&
      typeof row === "object" &&
      rowUserId(row) === uid &&
      deriveMemoryIdLocal(row) === target
    ) {
      snapshotBuffer.splice(i, 1);
      removed += 1;
    }
  }

  if (removed === 0) {
    return { ok: false, message: "not found" };
  }
  return { ok: true };
}

/**
 * @param {number} [limit]
 */
function listRecentMemoryRecords(limit = 50, userId = "dev-user") {
  const rows = mergeRowsSorted(limit, userId);
  return rows.map(normalizeMemoryItem);
}

/**
 * 与 list 同源，默认更大窗口（API /memory-records/snapshot）
 * @param {number} [limit]
 */
function getMemorySnapshot(limit = 100, userId = "dev-user") {
  return listRecentMemoryRecords(Math.max(1, Math.min(limit, 200)), userId);
}

module.exports = {
  recordMemory,
  deleteMemoryForUser,
  listRecentMemoryRecords,
  getMemorySnapshot,
  getAllUserMemoryRows,
  findMemoryRowByIdForUser,
  DATA_DIR
};
