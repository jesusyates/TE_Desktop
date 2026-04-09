/**
 * C-2 — 多端 Header 解析（product / client_platform）。禁止从本地 market 覆盖 token 权威。
 */

function pickHeader(req, name) {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

const ALLOWED_PRODUCTS = new Set(["aics", "tooleagle"]);
const ALLOWED_PLATFORMS = new Set(["desktop", "web"]);

/**
 * @returns {{ product: string, client_platform: string } | { error: string }}
 */
function parseClientHeaders(req) {
  const rawProduct = pickHeader(req, "x-client-product") || pickHeader(req, "x-product");
  const rawPlatform = pickHeader(req, "x-client-platform");
  const product = rawProduct != null ? String(rawProduct).trim().toLowerCase() : "";
  const client_platform = rawPlatform != null ? String(rawPlatform).trim().toLowerCase() : "";
  if (!product || !client_platform) return { error: "client_headers_required" };
  if (!ALLOWED_PRODUCTS.has(product)) return { error: "invalid_client_product" };
  if (!ALLOWED_PLATFORMS.has(client_platform)) return { error: "invalid_client_platform" };
  return { product, client_platform };
}

module.exports = { pickHeader, parseClientHeaders, ALLOWED_PRODUCTS, ALLOWED_PLATFORMS };
