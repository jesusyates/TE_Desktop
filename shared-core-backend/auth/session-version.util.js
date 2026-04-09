/**
 * C-6 — 会话版本唯一入口（委托 preferences-sync）。签发 JWT 须经此取 session_version，禁止在 auth.handlers 内自行维护计数。
 */
const preferencesSync = require("../preferences/preferences-sync.service");

function getCurrentSessionVersionForIssuance(user_id) {
  return preferencesSync.getCurrentSessionVersion(user_id);
}

module.exports = {
  getCurrentSessionVersionForIssuance,
  getCurrentSessionVersion: preferencesSync.getCurrentSessionVersion,
  bumpSessionVersion: preferencesSync.bumpSessionVersion
};
