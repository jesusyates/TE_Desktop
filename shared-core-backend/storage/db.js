/**
 * C-7 — Core 存储（Auth / SQLite）：memory 或 local SQLite。
 * STORAGE_MODE 为 local | dual_write | cloud_primary 时走 SQLite；memory | stub_supabase 时走 memory。
 * v1 域表由 src/stores/factory + Supabase，与本文件职责分离。
 */
const path = require("path");
const fs = require("fs");
const { storageLog } = require("./storage.log");

/** @type {import('node:sqlite').DatabaseSync | null} */
let db = null;
/** @type {'memory' | 'local'} */
let backendMode = "local";

/** @type {typeof import('node:sqlite').DatabaseSync | null | undefined} undefined = not loaded */
let DatabaseSyncModule = undefined;

function loadSqliteOrNull() {
  if (DatabaseSyncModule !== undefined) return DatabaseSyncModule;
  try {
    DatabaseSyncModule = require("node:sqlite").DatabaseSync;
  } catch {
    DatabaseSyncModule = null;
  }
  return DatabaseSyncModule;
}

function resolveModeFromEnv() {
  const m = (process.env.STORAGE_MODE || "").toLowerCase().trim();
  if (m === "memory" || m === "stub_supabase" || process.env.SHARED_CORE_STORAGE === "memory") {
    return "memory";
  }
  if (m === "local" || m === "local_only" || m === "dual_write" || m === "cloud_primary")
    return "local";
  return "local";
}

function resolveDbFilePath() {
  const raw = process.env.SHARED_CORE_DB_PATH;
  if (raw && path.isAbsolute(raw)) return raw;
  if (raw) return path.resolve(process.cwd(), raw);
  const nextToModule = path.join(__dirname, "shared-core.sqlite");
  const monorepoGuess = path.resolve(process.cwd(), "shared-core-backend", "storage", "shared-core.sqlite");
  if (fs.existsSync(monorepoGuess)) return monorepoGuess;
  return nextToModule;
}

/**
 * 初始化存储（migrate / consistency 之前调用）。
 * @returns {{ mode: 'memory' | 'local', path?: string }}
 */
function initStorage() {
  backendMode = resolveModeFromEnv();

  if (backendMode === "memory") {
    storageLog({ event: "storage_initialized", backend: "memory" });
    return { mode: "memory" };
  }

  const DatabaseSync = loadSqliteOrNull();
  if (!DatabaseSync) {
    throw new Error("node:sqlite unavailable; set STORAGE_MODE=memory or use Node 22+");
  }

  backendMode = "local";
  const dbPath = resolveDbFilePath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  storageLog({ event: "storage_initialized", backend: "sqlite", path: dbPath });
  return { mode: "local", path: dbPath };
}

function getDb() {
  if (backendMode !== "local") {
    throw new Error(`getDb() invalid in STORAGE_MODE=${backendMode}`);
  }
  if (!db) {
    throw new Error("storage not initialized; call initStorage() first");
  }
  return db;
}

function isMemoryStorage() {
  return backendMode === "memory";
}

function getStorageMode() {
  return backendMode;
}

function closeStorage() {
  if (db) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    db = null;
  }
}

module.exports = {
  initStorage,
  getDb,
  isMemoryStorage,
  getStorageMode,
  closeStorage,
  resolveDbFilePath
};
