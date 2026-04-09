const { AppError } = require("../../utils/AppError");

async function getPublicAuthInfo(ctx) {
  if (!ctx || !ctx.requestId) {
    throw new AppError("INVALID_CONTEXT", "Request context missing", 500);
  }
  return {
    ok: true,
    message: "v1 auth placeholder — use /auth/* for real flows",
    market: ctx.market,
    locale: ctx.locale
  };
}

module.exports = { getPublicAuthInfo };
