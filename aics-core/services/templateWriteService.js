/**
 * E-2：写入用户模板（正式结构 + content；userId 仅来自 ctx）。
 */
const {
  PRODUCT_AICS,
  DEFAULT_TEMPLATE_TYPE,
  DEFAULT_VERSION,
  DEFAULT_AUDIENCE
} = require("../schema/templateSchema");
const { normalizeSaveBody } = require("../schema/templateSaveSchema");
const userTemplatesRepository = require("./userTemplatesRepository");

/**
 * @param {string} userId
 * @param {unknown} body
 * @returns {{ templateId: string }}
 */
function saveUserTemplate(userId, body) {
  const uid = String(userId || "").trim();
  if (!uid) throw new Error("unauthorized");

  const norm = normalizeSaveBody(body);
  if (!norm.ok) {
    const err = new Error(norm.message);
    err.code = "validation";
    throw err;
  }
  const v = norm.value;
  const now = new Date().toISOString();
  const templateId = userTemplatesRepository.newTemplateId();

  const record = {
    templateId,
    userId: uid,
    templateType: v.templateType || DEFAULT_TEMPLATE_TYPE,
    title: v.title,
    description: v.description,
    product: v.product || PRODUCT_AICS,
    market: v.market,
    locale: v.locale,
    workflowType: v.workflowType,
    version: v.version || DEFAULT_VERSION,
    audience: v.audience || DEFAULT_AUDIENCE,
    isSystem: false,
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
    sourceTaskId: v.sourceTaskId,
    sourceResultId: v.sourceResultId,
    content: v.content
  };

  userTemplatesRepository.appendUserTemplate(uid, record);
  return { templateId };
}

/**
 * H-3：删除当前用户的自建模板；系统模板禁止。
 * @param {string} userId
 * @param {string} templateId
 */
function deleteUserTemplate(userId, templateId) {
  const uid = String(userId || "").trim();
  const tid = String(templateId || "").trim();
  if (!uid) {
    const err = new Error("unauthorized");
    err.code = "unauthorized";
    throw err;
  }
  if (!tid) {
    const err = new Error("invalid_template_id");
    err.code = "validation";
    throw err;
  }
  if (tid.startsWith("sys-")) {
    const err = new Error("cannot_delete_system_template");
    err.code = "forbidden";
    throw err;
  }
  const ok = userTemplatesRepository.deleteUserTemplate(uid, tid);
  if (!ok) {
    const err = new Error("not_found");
    err.code = "not_found";
    throw err;
  }
  return { ok: true };
}

module.exports = { saveUserTemplate, deleteUserTemplate };
