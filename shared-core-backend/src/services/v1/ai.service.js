const { config } = require("../../infra/config");

async function routerPlaceholder(ctx) {
  const c = config();
  return {
    ok: true,
    routed: false,
    message: "v1 AI router placeholder — all AI must go through Core safety chain",
    hasOpenAiKey: Boolean(c.openaiApiKey),
    requestId: ctx.requestId
  };
}

module.exports = { routerPlaceholder };
