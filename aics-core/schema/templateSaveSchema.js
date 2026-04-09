/**
 * E-2：POST /templates/save 请求体验证与归一（禁止信任 body.userId）。
 */

const { PRODUCT_AICS } = require("./templateSchema");

/**
 * @param {unknown} body
 * @returns {{ ok: true; value: object } | { ok: false; message: string }}
 */
function normalizeSaveBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "invalid body" };
  }
  const b = /** @type {Record<string, unknown>} */ (body);
  if ("userId" in b) {
    return { ok: false, message: "userId must not be sent in body" };
  }

  const templateType = typeof b.templateType === "string" ? b.templateType.trim() : "";
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const description = typeof b.description === "string" ? b.description.trim() : "";
  const product = typeof b.product === "string" ? b.product.trim() : PRODUCT_AICS;
  const market = typeof b.market === "string" ? b.market.trim() : "";
  const locale = typeof b.locale === "string" ? b.locale.trim() : "";
  const workflowType = typeof b.workflowType === "string" ? b.workflowType.trim() : "";
  const version = typeof b.version === "string" ? b.version.trim() : "1";
  const audience = typeof b.audience === "string" ? b.audience.trim() : "general";
  const sourceTaskId = typeof b.sourceTaskId === "string" ? b.sourceTaskId.trim() : "";
  const sourceResultId = typeof b.sourceResultId === "string" ? b.sourceResultId.trim() : "";
  const content = b.content;

  if (!templateType) return { ok: false, message: "templateType is required" };
  if (!title) return { ok: false, message: "title is required" };
  if (!market) return { ok: false, message: "market is required" };
  if (!locale) return { ok: false, message: "locale is required" };
  if (!workflowType) return { ok: false, message: "workflowType is required" };
  if (!sourceTaskId) return { ok: false, message: "sourceTaskId is required" };
  if (content == null || typeof content !== "object" || Array.isArray(content)) {
    return { ok: false, message: "content object is required" };
  }
  const c = /** @type {Record<string, unknown>} */ (content);
  const sp = typeof c.sourcePrompt === "string" ? c.sourcePrompt.trim() : "";
  if (!sp) return { ok: false, message: "content.sourcePrompt is required" };
  if (product !== PRODUCT_AICS) {
    return { ok: false, message: "product must be aics" };
  }

  return {
    ok: true,
    value: {
      templateType,
      title,
      description,
      product,
      market,
      locale,
      workflowType,
      version,
      audience,
      sourceTaskId,
      sourceResultId,
      content: { ...c, sourcePrompt: sp }
    }
  };
}

module.exports = { normalizeSaveBody };
