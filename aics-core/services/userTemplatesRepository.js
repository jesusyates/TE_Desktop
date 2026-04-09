/**
 * E-2：用户模板持久化（JSON 文件；重启保留）。按 userId 分桶隔离。
 */
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { resolveCoreDataDir } = require("../resolveCoreDataDir");

const DATA_DIR = resolveCoreDataDir();
const STORE_FILE = path.join(DATA_DIR, "user-templates.json");

/** @typedef {{ version: number; byUserId: Record<string, object[]> }} StoreShape */

/** @returns {StoreShape} */
function emptyStore() {
  return { version: 1, byUserId: {} };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/** @returns {StoreShape} */
function loadStoreSync() {
  try {
    if (!fs.existsSync(STORE_FILE)) return emptyStore();
    const text = fs.readFileSync(STORE_FILE, "utf8");
    const o = JSON.parse(text);
    if (!o || typeof o !== "object" || o.version !== 1 || typeof o.byUserId !== "object" || o.byUserId === null) {
      return emptyStore();
    }
    return /** @type {StoreShape} */ (o);
  } catch (e) {
    console.error("[userTemplatesRepository] load failed", e);
    return emptyStore();
  }
}

/** @param {StoreShape} data */
function saveStoreSync(data) {
  ensureDataDir();
  const tmp = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 0), "utf8");
  fs.renameSync(tmp, STORE_FILE);
}

/**
 * @param {string} userId
 * @param {object} record full row including content
 */
function appendUserTemplate(userId, record) {
  const uid = String(userId || "").trim();
  if (!uid) throw new Error("user_id_required");
  const store = loadStoreSync();
  const list = Array.isArray(store.byUserId[uid]) ? store.byUserId[uid].slice() : [];
  const tid = String(record.templateId || "").trim();
  if (!tid) throw new Error("template_id_required");
  const filtered = list.filter((r) => r && String(r.templateId) !== tid);
  filtered.push(record);
  filtered.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  store.byUserId[uid] = filtered;
  saveStoreSync(store);
  return tid;
}

/**
 * @param {string} userId
 * @returns {object[]}
 */
function listUserTemplates(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return [];
  const store = loadStoreSync();
  const list = store.byUserId[uid];
  return Array.isArray(list) ? list : [];
}

/**
 * @param {string} userId
 * @param {string} templateId
 * @returns {object | null}
 */
function getUserTemplate(userId, templateId) {
  const uid = String(userId || "").trim();
  const tid = String(templateId || "").trim();
  if (!uid || !tid) return null;
  const rows = listUserTemplates(uid);
  return rows.find((r) => r && String(r.templateId) === tid) || null;
}

function newTemplateId() {
  return `tpl-${randomUUID()}`;
}

/**
 * H-3：删除用户模板（系统模板不在此存储中）。
 * @param {string} userId
 * @param {string} templateId
 * @returns {boolean} 是否删除了一条
 */
function deleteUserTemplate(userId, templateId) {
  const uid = String(userId || "").trim();
  const tid = String(templateId || "").trim();
  if (!uid || !tid) return false;
  const store = loadStoreSync();
  const list = Array.isArray(store.byUserId[uid]) ? store.byUserId[uid].slice() : [];
  const next = list.filter((r) => r && String(r.templateId) !== tid);
  if (next.length === list.length) return false;
  store.byUserId[uid] = next;
  saveStoreSync(store);
  return true;
}

module.exports = {
  appendUserTemplate,
  deleteUserTemplate,
  listUserTemplates,
  getUserTemplate,
  newTemplateId,
  _STORE_FILE: STORE_FILE
};
