/**
 * 核心落盘维度：与 request context 一致，供各 store 统一写入。
 */
const { config } = require("./config");

/**
 * @param {import('express').Request['context']|null} ctx
 * @returns {{ market: string, locale: string, product: string }}
 */
function getStorageDimensions(ctx) {
  const c = config();
  const marketRaw =
    ctx && ctx.market != null && String(ctx.market).trim() !== ""
      ? String(ctx.market).trim()
      : c.defaultMarket || "global";
  const localeRaw =
    ctx && ctx.locale != null && String(ctx.locale).trim() !== ""
      ? String(ctx.locale).trim()
      : c.defaultLocale || "en-US";
  const productRaw =
    ctx && ctx.product != null && String(ctx.product).trim() !== ""
      ? String(ctx.product).trim().toLowerCase()
      : String(c.defaultProduct || "aics")
          .trim()
          .toLowerCase() || "aics";
  return {
    market: marketRaw,
    locale: localeRaw,
    product: productRaw
  };
}

module.exports = { getStorageDimensions };
