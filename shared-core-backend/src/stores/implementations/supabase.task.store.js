const { randomUUID } = require("crypto");
const { TaskStore } = require("../task-store.base");
const taskAdapter = require("../../infra/supabase/adapters/task.adapter");
const {
  userKey,
  normalizeTaskForCreate,
  normalizeTaskRow
} = require("../../schemas/domain-stores.schema");

class SupabaseTaskStore extends TaskStore {
  async list(ctx, _query) {
    const uid = userKey(ctx);
    const data = await taskAdapter.listByUserId(uid, { limit: 200 });
    return (data || []).map((r) => normalizeTaskRow(r));
  }

  async getById(ctx, id) {
    const uid = userKey(ctx);
    const data = await taskAdapter.selectById(id);
    if (!data) return null;
    if (data.user_id !== uid && uid !== "anonymous") return null;
    return normalizeTaskRow(data);
  }

  async create(ctx, payload) {
    const norm = normalizeTaskForCreate(ctx, payload);
    const id = payload && payload.id ? String(payload.id) : `tsk_${randomUUID()}`;
    const row = {
      id,
      user_id: norm.user_id,
      title: norm.title,
      status: norm.status,
      payload: norm.payload,
      market: norm.market,
      locale: norm.locale,
      product: norm.product,
      created_at: norm.created_at,
      updated_at: norm.updated_at
    };
    await taskAdapter.insertRow(row);
    return normalizeTaskRow(row);
  }

  async update(ctx, id, merged) {
    const uid = userKey(ctx);
    const data = await taskAdapter.updateRow(id, uid, {
      title: merged.title,
      status: merged.status,
      payload: merged.payload,
      updated_at: merged.updated_at
    });
    if (!data) return null;
    return normalizeTaskRow(data);
  }

  async delete(ctx, id) {
    const uid = userKey(ctx);
    return taskAdapter.deleteRow(id, uid);
  }
}

module.exports = { SupabaseTaskStore };
