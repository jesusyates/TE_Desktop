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

/** v1 统一四类；入站别名在写入前收敛 */
function normalizeTaskStatus(raw) {
  const s = String(raw == null ? "" : raw)
    .trim()
    .toLowerCase();
  const map = {
    draft: "pending",
    planning: "pending",
    ready: "pending",
    pending: "pending",
    queued: "pending",
    running: "running",
    success: "completed",
    partial_success: "completed",
    completed: "completed",
    done: "completed",
    stopped: "completed",
    failed: "failed",
    error: "failed",
    cancelled: "failed"
  };
  return map[s] || "pending";
}

function normalizeTaskForCreate(ctx, payload) {
  const uid = userKey(ctx);
  const p = payload && typeof payload === "object" ? { ...payload } : {};
  /* id 由表主键承载，不写入 payload JSON */
  delete p.id;
  const titleRaw = p.title != null ? String(p.title).trim() : "";
  const title =
    titleRaw.length > 0
      ? titleRaw.slice(0, 500)
      : p.oneLinePrompt != null
        ? String(p.oneLinePrompt).slice(0, 500)
        : "";
  const status = normalizeTaskStatus(p.status);
  delete p.title;
  delete p.status;
  return {
    user_id: uid,
    title,
    status,
    payload: p,
    created_at: nowIso(),
    updated_at: nowIso()
  };
}

/**
 * 合并 PATCH：body 可为 status、result、lastErrorSummary、steps、appendLog、upsertStep、title 等
 * existing 为 store 内存行：{ id, userId, title, status, payload, createdAt, updatedAt } 或由 list 归一化行反推
 */
function mergeTaskPatchFromBody(existing, body) {
  const b = body && typeof body === "object" ? body : {};
  const nextStatus = b.status != null ? normalizeTaskStatus(b.status) : null;
  const nextTitle =
    b.title != null
      ? String(b.title).slice(0, 500)
      : b.prompt != null
        ? String(b.prompt).slice(0, 500)
        : null;

  let payload =
    existing.payload && typeof existing.payload === "object" && !Array.isArray(existing.payload)
      ? { ...existing.payload }
      : {};

  if (b.result !== undefined) payload.result = b.result;
  if (b.lastErrorSummary !== undefined) payload.lastErrorSummary = b.lastErrorSummary;
  if (Array.isArray(b.steps)) payload.steps = b.steps;

  if (b.appendLog && typeof b.appendLog === "object") {
    const logs = Array.isArray(payload.logs) ? [...payload.logs] : [];
    logs.push({ ...b.appendLog, createdAt: b.appendLog.createdAt || nowIso() });
    payload.logs = logs;
  }

  if (b.upsertStep && typeof b.upsertStep === "object") {
    const st = b.upsertStep;
    const sid = st.stepId != null ? String(st.stepId) : "";
    const steps = Array.isArray(payload.steps) ? [...payload.steps] : [];
    const idx = steps.findIndex((x) => x && String(x.id) === sid);
    const merged = {
      id: sid,
      order: st.stepOrder,
      title: st.title,
      action: st.actionName != null ? st.actionName : st.action,
      status: st.status,
      input: st.input,
      output: st.output,
      error: st.error,
      errorType: st.errorType,
      latency: st.latency
    };
    if (idx >= 0) steps[idx] = { ...steps[idx], ...merged };
    else steps.push(merged);
    payload.steps = steps;
  }

  return {
    title: nextTitle != null ? nextTitle : existing.title,
    status: nextStatus !== null ? nextStatus : existing.status,
    payload,
    updated_at: nowIso()
  };
}

/** 将 normalizeTaskRow 结果转回 store 行（仅用于 patch 链） */
function denormalizeRowToStoreShape(row) {
  if (!row || typeof row !== "object") return null;
  const o = row;
  const payload = {};
  const keep = new Set([
    "id",
    "userId",
    "title",
    "status",
    "createdAt",
    "updatedAt",
    "user_id",
    "created_at",
    "updated_at"
  ]);
  for (const k of Object.keys(o)) {
    if (!keep.has(k)) payload[k] = o[k];
  }
  return {
    id: o.id,
    userId: o.userId != null ? o.userId : o.user_id,
    title: o.title,
    status: normalizeTaskStatus(o.status),
    payload,
    createdAt: o.createdAt != null ? o.createdAt : o.created_at,
    updatedAt: o.updatedAt != null ? o.updatedAt : o.updated_at
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
  normalizeTaskStatus,
  normalizeTaskForCreate,
  normalizeTaskRow,
  mergeTaskPatchFromBody,
  denormalizeRowToStoreShape,
  normalizeMemoryAppend,
  normalizeMemoryEntryRow,
  normalizeTemplateForCreate,
  normalizeTemplateRow
};
