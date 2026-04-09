/**
 * Domain store 写入前规范化（禁止在 service 内拼装 DB 形状）。
 */
function userKey(ctx) {
  const uid = ctx && ctx.userId;
  return uid && String(uid).trim() !== "" ? String(uid).trim() : "anonymous";
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeTaskForCreate(ctx, payload) {
  const uid = userKey(ctx);
  const title = payload && payload.title != null ? String(payload.title).slice(0, 500) : "";
  const status = payload && payload.status != null ? String(payload.status).slice(0, 64) : "draft";
  const extra = payload && typeof payload === "object" ? { ...payload } : {};
  delete extra.title;
  delete extra.status;
  return {
    user_id: uid,
    title,
    status,
    payload: extra,
    created_at: nowIso(),
    updated_at: nowIso()
  };
}

function normalizeTaskRow(row) {
  if (!row) return null;
  const payload = row.payload;
  let p = {};
  if (payload && typeof payload === "object" && !Array.isArray(payload)) p = { ...payload };
  else if (typeof payload === "string") {
    try {
      p = JSON.parse(payload || "{}");
    } catch {
      p = {};
    }
  }
  return {
    id: row.id,
    userId: row.user_id != null ? row.user_id : row.userId,
    title: row.title,
    status: row.status,
    ...p,
    createdAt: row.created_at != null ? row.created_at : row.createdAt,
    updatedAt: row.updated_at != null ? row.updated_at : row.updatedAt
  };
}

function normalizeMemoryAppend(ctx, partial) {
  return {
    user_id: userKey(ctx),
    entry_key:
      partial && partial.key != null
        ? String(partial.key).slice(0, 200)
        : partial && partial.entry_key != null
          ? String(partial.entry_key).slice(0, 200)
          : null,
    value:
      partial && partial.value != null && typeof partial.value === "object"
        ? partial.value
        : { raw: partial && partial.value != null ? String(partial.value).slice(0, 8000) : "" },
    created_at: nowIso()
  };
}

function normalizeMemoryEntryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id != null ? row.user_id : row.userId,
    key: row.entry_key != null ? row.entry_key : row.key,
    value: row.value,
    createdAt: row.created_at != null ? row.created_at : row.createdAt
  };
}

function normalizeTemplateForCreate(ctx, payload) {
  const uid = userKey(ctx);
  const title = payload && payload.title != null ? String(payload.title).slice(0, 500) : "untitled";
  const scope = payload && payload.scope === "global" ? "global" : "user";
  const body =
    payload && payload.body != null && typeof payload.body === "object"
      ? payload.body
      : { text: payload && payload.body != null ? String(payload.body).slice(0, 32000) : "" };
  const id =
    payload && payload.id != null
      ? String(payload.id).slice(0, 128)
      : `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    user_id: scope === "global" ? null : uid,
    scope,
    title,
    body,
    created_at: nowIso(),
    updated_at: nowIso()
  };
}

function normalizeTemplateRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id != null ? row.user_id : row.userId,
    scope: row.scope || "user",
    title: row.title,
    body: row.body,
    createdAt: row.created_at != null ? row.created_at : row.createdAt,
    updatedAt: row.updated_at != null ? row.updated_at : row.updatedAt
  };
}

module.exports = {
  userKey,
  normalizeTaskForCreate,
  normalizeTaskRow,
  normalizeMemoryAppend,
  normalizeMemoryEntryRow,
  normalizeTemplateForCreate,
  normalizeTemplateRow
};
