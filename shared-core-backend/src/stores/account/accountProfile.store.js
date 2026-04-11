/**
 * Identity 源聚合：local_only 仅 SQLite users；dual_write / cloud_primary 优先 Supabase profiles 再回落。
 */
const { config } = require("../../infra/config");
const { isSupabaseConfigured } = require("../../infra/supabase/client");
const userAdapter = require("../../infra/supabase/adapters/user.adapter");
const usersStore = require("../../../storage/adapters/users.adapter");
const { logStorageDiff } = require("../../infra/logging/storageDiffLogger");

/**
 * @param {string} userId
 * @param {string|null} [requestId]
 * @returns {Promise<{ local: object | null, profile: Record<string, unknown> | null }>}
 */
async function loadIdentitySources(userId, requestId = null) {
  const id = userId != null ? String(userId).trim() : "";
  if (!id) return { local: null, profile: null };

  const local = usersStore.findById(id);
  const mode = config().domainStorageMode;

  if (mode === "local_only" || !isSupabaseConfigured()) {
    return { local, profile: null };
  }

  let profile = null;
  try {
    profile = await userAdapter.fetchProfile(id);
  } catch (e) {
    logStorageDiff({
      userId: id,
      entity: "profile",
      operation: "read",
      localSuccess: true,
      cloudSuccess: false,
      error: e,
      requestId
    });
  }

  if ((mode === "dual_write" || mode === "cloud_primary") && !profile && local) {
    logStorageDiff({
      userId: id,
      entity: "profile",
      operation: "read",
      localSuccess: true,
      cloudSuccess: false,
      error: "cloud_profile_miss_fallback_local",
      requestId
    });
  }

  return { local, profile };
}

/**
 * 统一接口：按 userId 取身份源（与历史 loadIdentitySources 对齐）。
 */
async function getById(userId, requestId) {
  return loadIdentitySources(userId, requestId);
}

/**
 * @param {object} patch — { id, email?, market?, locale? }
 * @param {string|null} [requestId]
 */
async function update(patch, requestId = null) {
  const id = patch && patch.id != null ? String(patch.id).trim() : "";
  if (!id) throw new Error("userId required");
  const mode = config().domainStorageMode;
  const row = {
    id,
    email: patch.email != null ? String(patch.email).trim() : null,
    market:
      patch.market != null && String(patch.market).trim()
        ? String(patch.market).trim().toLowerCase()
        : "global",
    locale:
      patch.locale != null && String(patch.locale).trim() ? String(patch.locale).trim() : "en"
  };

  if (mode === "local_only" || !isSupabaseConfigured()) {
    logStorageDiff({
      userId: id,
      entity: "profile",
      operation: "update",
      localSuccess: true,
      cloudSuccess: null,
      requestId
    });
    return { local: usersStore.findById(id), profile: null };
  }

  const results = await Promise.allSettled([userAdapter.upsertProfile(row)]);
  const cloudOk = results[0].status === "fulfilled" && results[0].value === true;
  logStorageDiff({
    userId: id,
    entity: "profile",
    operation: "update",
    localSuccess: true,
    cloudSuccess: cloudOk,
    error: cloudOk ? null : results[0].reason,
    requestId
  });

  let profile = null;
  try {
    profile = await userAdapter.fetchProfile(id);
  } catch (e) {
    logStorageDiff({
      userId: id,
      entity: "profile",
      operation: "read",
      cloudSuccess: false,
      error: e,
      requestId
    });
  }
  return { local: usersStore.findById(id), profile };
}

/**
 * @param {object} data — 同 update */
async function create(data, requestId) {
  return update(data, requestId);
}

/**
 * @param {string} userId
 */
async function listByUser(userId) {
  const one = await getById(userId, null);
  return one.local || one.profile ? [one] : [];
}

module.exports = {
  loadIdentitySources,
  getById,
  create,
  update,
  listByUser
};
