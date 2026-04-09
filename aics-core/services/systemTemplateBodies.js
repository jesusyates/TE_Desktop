/**
 * E-3：系统模板完整 content（与列表 meta 分离，单一真相在 Core）。
 * 文案须与客户端历史系统模板对齐。
 */
/** @type {Record<string, object>} */
const SYSTEM_CONTENT_BY_ID = {
  "sys-short-video-copy": {
    sourcePrompt:
      "主题：【在此填写】\n请生成一条短视频文案：包含 Hook、内容结构大纲、正文要点、标签与发布建议。",
    requestedMode: "content",
    stepsSnapshot: [],
    resultSnapshot: { title: "", bodyPreview: "", stepCount: 0 },
    sourceResultKind: "none"
  },
  "sys-product-bullet": {
    sourcePrompt:
      "产品/服务：【在此填写】\n请输出：核心受众、3–5 条卖点、一句行动号召（CTA）。",
    requestedMode: "content",
    stepsSnapshot: [],
    resultSnapshot: { title: "", bodyPreview: "", stepCount: 0 },
    sourceResultKind: "none"
  },
  "sys-computer-organize": {
    sourcePrompt: "请根据我的说明整理指定文件夹中的文件（路径与规则在正文中补充）。",
    requestedMode: "computer",
    stepsSnapshot: [],
    resultSnapshot: { title: "", bodyPreview: "", stepCount: 0 },
    sourceResultKind: "none"
  }
};

/**
 * @param {string} templateId
 * @param {object} listMeta row from systemTemplates
 * @returns {object | null}
 */
function buildSystemTemplateFullRecord(listMeta, templateId) {
  if (!listMeta) return null;
  const body = SYSTEM_CONTENT_BY_ID[templateId];
  if (!body) return null;
  return {
    ...listMeta,
    sourceTaskId: "",
    sourceResultId: "",
    content: {
      v: 1,
      ...body
    }
  };
}

module.exports = {
  buildSystemTemplateFullRecord,
  SYSTEM_CONTENT_BY_ID
};
