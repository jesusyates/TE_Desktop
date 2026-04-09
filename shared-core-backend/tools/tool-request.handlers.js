const { validateToolRequestBody } = require("./tool-request.schema");
const { createToolRequest, listForUser } = require("./tool-request.store");

/**
 * @param {import('http').IncomingMessage & { context?: { user_id: string } }} req
 * @param {unknown} body
 */
function handleCreate(req, body) {
  const user_id = req.context && req.context.userId;
  if (!user_id) return { status: 401, body: { message: "unauthorized" } };
  const v = validateToolRequestBody(body);
  if (!v.ok) return { status: 400, body: { message: v.message } };
  const rec = createToolRequest(user_id, v.data);
  return {
    status: 201,
    body: {
      id: rec.id,
      status: rec.status,
      created_at: rec.created_at
    }
  };
}

/**
 * @param {import('http').IncomingMessage & { context?: { user_id: string } }} req
 */
function handleList(req) {
  const user_id = req.context && req.context.userId;
  if (!user_id) return { status: 401, body: { message: "unauthorized" } };
  const items = listForUser(user_id).map((r) => ({
    id: r.id,
    status: r.status,
    tool_name: r.tool_name,
    tool_type: r.tool_type,
    purpose: r.purpose,
    website_url: r.website_url,
    screenshot_note: r.screenshot_note,
    capability: r.capability,
    created_at: r.created_at,
    updated_at: r.updated_at
  }));
  return { status: 200, body: { items } };
}

module.exports = { handleCreate, handleList };
