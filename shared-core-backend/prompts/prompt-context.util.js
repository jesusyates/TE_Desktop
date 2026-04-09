/**
 * C-4 — Prompt 分层对象（最小实现；后续 Prompt Registry 扩展）。禁止缺 market/locale 时静默写死 global 默认值。
 */
const { contextLog } = require("../context/context.log");

/**
 * @param {object} requestContext req.context
 */
function buildPromptContext(requestContext) {
  if (
    !requestContext ||
    requestContext.market == null ||
    String(requestContext.market).trim() === "" ||
    requestContext.locale == null ||
    String(requestContext.locale).trim() === ""
  ) {
    throw new Error("prompt_context_requires_market_locale");
  }
  const prompt_context = {
    global: {
      product: requestContext.product,
      client_platform: requestContext.platform
    },
    market: { market: requestContext.market },
    locale: { locale: requestContext.locale },
    user: { user_id: requestContext.userId }
  };
  contextLog({
    event: "prompt_context_built",
    user_id: requestContext.userId,
    market: requestContext.market,
    locale: requestContext.locale,
    product: requestContext.product,
    client_platform: requestContext.platform
  });
  return prompt_context;
}

module.exports = { buildPromptContext };
