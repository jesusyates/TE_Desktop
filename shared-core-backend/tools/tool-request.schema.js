const { getCapability } = require("../../runtime/capabilities/capability.registry");

const MAX_LEN = {
  name: 200,
  type: 120,
  purpose: 2000,
  url: 2000,
  screenshot_note: 2000,
  capability: 80
};

/**
 * @param {unknown} body
 * @returns {{ ok: true, data: Record<string, string> } | { ok: false, message: string }}
 */
function validateToolRequestBody(body) {
  if (!body || typeof body !== "object") return { ok: false, message: "invalid_body" };
  const tool_name = String(body.tool_name || "").trim();
  const tool_type = String(body.tool_type || "").trim();
  const purpose = String(body.purpose || "").trim();
  const website_url = String(body.website_url || "").trim();
  const screenshot_note = String(body.screenshot_note || "").trim();
  const capability = String(body.capability || "").trim();

  if (!tool_name || tool_name.length > MAX_LEN.name) return { ok: false, message: "invalid_tool_name" };
  if (!tool_type || tool_type.length > MAX_LEN.type) return { ok: false, message: "invalid_tool_type" };
  if (!purpose || purpose.length > MAX_LEN.purpose) return { ok: false, message: "invalid_purpose" };
  if (website_url.length > MAX_LEN.url) return { ok: false, message: "invalid_website_url" };
  if (screenshot_note.length > MAX_LEN.screenshot_note) return { ok: false, message: "invalid_screenshot_note" };
  if (!capability || capability.length > MAX_LEN.capability) return { ok: false, message: "invalid_capability" };
  if (!getCapability(capability)) return { ok: false, message: "unknown_capability" };

  return {
    ok: true,
    data: {
      tool_name,
      tool_type,
      purpose,
      website_url,
      screenshot_note,
      capability
    }
  };
}

module.exports = { validateToolRequestBody, MAX_LEN };
