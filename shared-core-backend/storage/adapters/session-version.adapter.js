/**
 * C-7 — session_version 持久化（preferences-sync 后端）。
 */
const svRepo = require("../repositories/session-version.sqlite");

function getCurrentSessionVersion(user_id) {
  const v = svRepo.getVersion(user_id);
  return v == null ? 1 : v;
}

function bumpSessionVersion(user_id) {
  return svRepo.bump(user_id);
}

module.exports = { getCurrentSessionVersion, bumpSessionVersion };
