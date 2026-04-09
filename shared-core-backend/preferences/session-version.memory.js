/** C-6/C-7 — session_version 内存后端（仅 SHARED_CORE_STORAGE=memory）。 */
/** @type {Map<string, number>} */
const sessionVersionByUser = new Map();

function getCurrentSessionVersion(user_id) {
  return sessionVersionByUser.get(user_id) ?? 1;
}

function bumpSessionVersion(user_id) {
  const cur = getCurrentSessionVersion(user_id);
  const next = cur + 1;
  sessionVersionByUser.set(user_id, next);
  return next;
}

module.exports = { getCurrentSessionVersion, bumpSessionVersion };
