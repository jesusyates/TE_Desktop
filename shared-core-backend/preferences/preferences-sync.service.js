/**
 * C-6 / C-7 — session_version；默认 SQLite（禁止在 auth.handlers 内散改版本）。
 *
 * 核心原则：用户手动选择 > 账号偏好 > 本地缓存 > IP/地区 > global/en-US；market 与 locale 解耦；
 * 身份 market/locale 仅由 Shared Core 裁定；客户端 header 只表达 product / client_platform。
 */
const { sessionLog } = require("../auth/session.log");

const sessionVersionBackend =
  process.env.SHARED_CORE_STORAGE === "memory"
    ? require("./session-version.memory")
    : require("../storage/adapters/session-version.adapter");

function getCurrentSessionVersion(user_id) {
  return sessionVersionBackend.getCurrentSessionVersion(user_id);
}

/**
 * @param {string} user_id
 * @param {{ market?: string, locale?: string, product?: string, client_platform?: string }} [ctx]
 */
function bumpSessionVersion(user_id, ctx) {
  const cur = getCurrentSessionVersion(user_id);
  const next = sessionVersionBackend.bumpSessionVersion(user_id);
  sessionLog({
    event: "session_version_bumped",
    user_id,
    market: ctx?.market ?? null,
    locale: ctx?.locale ?? null,
    product: ctx?.product ?? null,
    client_platform: ctx?.client_platform ?? null,
    from_version: cur,
    to_version: next
  });
  return next;
}

module.exports = { getCurrentSessionVersion, bumpSessionVersion };
