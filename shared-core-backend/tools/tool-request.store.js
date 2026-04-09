const { randomUUID } = require("crypto");

/** @type {Array<import('./tool-request.types').ToolRequestRecord>} */
const records = [];

const now = () => new Date().toISOString();

/**
 * @param {string} user_id
 * @param {Record<string, string>} fields
 */
function createToolRequest(user_id, fields) {
  const rec = {
    id: `toolreq_${randomUUID()}`,
    user_id,
    status: "submitted",
    ...fields,
    created_at: now(),
    updated_at: now()
  };
  records.push(rec);
  return rec;
}

function listForUser(user_id) {
  return records
    .filter((r) => r.user_id === user_id)
    .slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

/**
 * 骨架占位：后续审核服务可调用（本阶段不对外暴露 HTTP）。
 * @param {string} id
 * @param {'under_review'|'approved'|'rejected'} status
 */
function updateStatus(id, status) {
  const rec = records.find((r) => r.id === id);
  if (!rec) return null;
  rec.status = status;
  rec.updated_at = now();
  return rec;
}

module.exports = { createToolRequest, listForUser, updateStatus, _records: records };
