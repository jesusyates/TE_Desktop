/**
 * D-7-3N / C-5：身份写入字段规范（ctx 须为 Route 层 buildRouteContext / parseRequestIdentity 产物）。
 */

/**
 * @param {{ userId?: string; clientId?: string; sessionToken?: string } | null | undefined} ctx
 * @returns {{ userId: string; clientId: string; sessionToken?: string }}
 */
function normalizeIdentityWrite(ctx) {
  if (!ctx || typeof ctx !== "object") {
    return { userId: "dev-user", clientId: "desktop-dev" };
  }
  const userId =
    ctx.userId != null && String(ctx.userId).trim() !== "" ? String(ctx.userId).trim() : "dev-user";
  const clientId =
    ctx.clientId != null && String(ctx.clientId).trim() !== ""
      ? String(ctx.clientId).trim()
      : "desktop-dev";
  const out = { userId, clientId };
  if (ctx.sessionToken != null && String(ctx.sessionToken).trim() !== "") {
    out.sessionToken = String(ctx.sessionToken).trim();
  }
  return out;
}

module.exports = { normalizeIdentityWrite };
