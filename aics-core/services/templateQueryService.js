/**
 * E-1 / E-2：模板列表查询（GET /templates/list）。系统模板内置；用户模板 JSON 持久化。
 */
const {
  PRODUCT_AICS,
  MARKET_GLOBAL,
  LOCALE_NEUTRAL,
  SYSTEM_USER_ID,
  DEFAULT_TEMPLATE_TYPE,
  DEFAULT_VERSION,
  DEFAULT_AUDIENCE
} = require("../schema/templateSchema");

const userTemplatesRepository = require("./userTemplatesRepository");
const { buildSystemTemplateFullRecord } = require("./systemTemplateBodies");

/**
 * @param {object} full
 * @returns {object | null}
 */
function toPublicListRow(full) {
  if (!full || typeof full !== "object") return null;
  return {
    templateId: full.templateId,
    userId: full.userId,
    templateType: full.templateType,
    title: full.title,
    description: typeof full.description === "string" ? full.description : "",
    product: full.product,
    market: full.market,
    locale: full.locale,
    workflowType: full.workflowType,
    version: full.version,
    audience: full.audience,
    isSystem: full.isSystem === true,
    isFavorite: full.isFavorite === true,
    createdAt: full.createdAt,
    updatedAt: full.updatedAt
  };
}

/** @returns {object[]} */
function buildSystemTemplates() {
  const now = "2026-01-15T00:00:00.000Z";
  return [
    {
      templateId: "sys-short-video-copy",
      userId: SYSTEM_USER_ID,
      templateType: DEFAULT_TEMPLATE_TYPE,
      title: "短视频文案骨架",
      description: "按主题生成钩子、结构、正文要点与发布建议",
      product: PRODUCT_AICS,
      market: MARKET_GLOBAL,
      locale: LOCALE_NEUTRAL,
      workflowType: "content",
      version: DEFAULT_VERSION,
      audience: DEFAULT_AUDIENCE,
      isSystem: true,
      isFavorite: false,
      createdAt: now,
      updatedAt: now
    },
    {
      templateId: "sys-product-bullet",
      userId: SYSTEM_USER_ID,
      templateType: DEFAULT_TEMPLATE_TYPE,
      title: "产品卖点清单",
      description: "从一句话产品信息扩展卖点条列",
      product: PRODUCT_AICS,
      market: MARKET_GLOBAL,
      locale: LOCALE_NEUTRAL,
      workflowType: "content",
      version: DEFAULT_VERSION,
      audience: DEFAULT_AUDIENCE,
      isSystem: true,
      isFavorite: false,
      createdAt: "2026-01-14T00:00:00.000Z",
      updatedAt: "2026-01-14T00:00:00.000Z"
    },
    {
      templateId: "sys-computer-organize",
      userId: SYSTEM_USER_ID,
      templateType: DEFAULT_TEMPLATE_TYPE,
      title: "桌面文件整理（Computer）",
      description: "偏向本地执行的整理类任务入口",
      product: PRODUCT_AICS,
      market: MARKET_GLOBAL,
      locale: LOCALE_NEUTRAL,
      workflowType: "computer",
      version: DEFAULT_VERSION,
      audience: DEFAULT_AUDIENCE,
      isSystem: true,
      isFavorite: false,
      createdAt: "2026-01-13T00:00:00.000Z",
      updatedAt: "2026-01-13T00:00:00.000Z"
    }
  ];
}

const systemTemplates = buildSystemTemplates();

/**
 * @param {string} userId
 * @param {URLSearchParams} searchParams
 * @returns {{ list: object[]; total: number }}
 */
function listTemplatesFormal(userId, searchParams) {
  const uid = String(userId || "").trim();
  const page = Math.max(1, parseInt(String(searchParams.get("page") || "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(searchParams.get("pageSize") || "20"), 10) || 20));

  const isSystemRaw = searchParams.get("isSystem");
  const isFavoriteRaw = searchParams.get("isFavorite");
  const workflowTypeRaw = (searchParams.get("workflowType") || "").trim();

  const userRowsFull = uid ? userTemplatesRepository.listUserTemplates(uid) : [];
  const userRows = userRowsFull.map(toPublicListRow).filter(Boolean);
  let merged = [...systemTemplates, ...userRows];

  if (isSystemRaw === "true") {
    merged = merged.filter((r) => r.isSystem === true);
  } else if (isSystemRaw === "false") {
    merged = merged.filter((r) => r.isSystem !== true);
  }

  if (isFavoriteRaw === "true") {
    merged = merged.filter((r) => r.isFavorite === true);
  } else if (isFavoriteRaw === "false") {
    merged = merged.filter((r) => r.isFavorite !== true);
  }

  if (workflowTypeRaw) {
    merged = merged.filter((r) => String(r.workflowType || "") === workflowTypeRaw);
  }

  merged.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

  const total = merged.length;
  const start = (page - 1) * pageSize;
  const list = merged.slice(start, start + pageSize);

  return { list, total };
}

/**
 * @param {string} userId
 * @param {string} templateId
 * @returns {object | null} 含 content；仅所有者
 */
function getTemplateDetailForUser(userId, templateId) {
  const uid = String(userId || "").trim();
  const tid = String(templateId || "").trim();
  if (!uid || !tid) return null;
  if (tid.startsWith("sys-")) {
    const meta = systemTemplates.find((t) => t.templateId === tid);
    return buildSystemTemplateFullRecord(meta, tid);
  }
  const row = userTemplatesRepository.getUserTemplate(uid, tid);
  if (!row) return null;
  return row;
}

module.exports = {
  listTemplatesFormal,
  getTemplateDetailForUser
};
