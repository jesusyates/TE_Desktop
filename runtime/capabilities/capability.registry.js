/**
 * 能力注册表：capability → 候选工具顺序（优先级由高到低）。
 * @type {import('./capability.schema.js').CapabilityDefinition[]}
 */
const CAPABILITIES = [
  {
    capability: "spreadsheet",
    label: { "zh-CN": "表格处理", "en-US": "Spreadsheet", "ja-JP": "Spreadsheet" },
    tool_candidates: ["excel", "wps_spreadsheet", "libreoffice_calc"],
    infer_keywords: ["excel", "xlsx", "csv", "表格", "spreadsheet", "sheet", "wps 表", "calc"]
  },
  {
    capability: "document_editing",
    label: { "zh-CN": "文档编辑", "en-US": "Document editing", "ja-JP": "Document editing" },
    tool_candidates: ["word", "wps_writer"],
    infer_keywords: ["word", "docx", "文档", "wps 文字", "writer", "稿件"]
  },
  {
    capability: "presentation",
    label: { "zh-CN": "演示文稿", "en-US": "Presentation", "ja-JP": "Presentation" },
    tool_candidates: ["powerpoint", "wps_presentation"],
    infer_keywords: ["ppt", "pptx", "幻灯片", "演示", "powerpoint", "keynote"]
  },
  {
    capability: "video_editing",
    label: { "zh-CN": "视频剪辑", "en-US": "Video editing", "ja-JP": "Video editing" },
    tool_candidates: ["capcut", "premiere"],
    infer_keywords: ["剪映", "capcut", "premiere", "视频剪辑", "剪辑", "短视频"]
  },
  {
    capability: "image_editing",
    label: { "zh-CN": "图像编辑", "en-US": "Image editing", "ja-JP": "Image editing" },
    tool_candidates: ["photoshop"],
    infer_keywords: ["photoshop", "ps ", "修图", "海报", "图层"]
  },
  {
    capability: "file_conversion",
    label: { "zh-CN": "格式转换", "en-US": "File conversion", "ja-JP": "File conversion" },
    tool_candidates: [],
    infer_keywords: ["转换", "convert", "pdf", "导出格式"]
  },
  {
    capability: "screen_capture",
    label: { "zh-CN": "截屏录屏", "en-US": "Screen capture", "ja-JP": "Screen capture" },
    tool_candidates: [],
    infer_keywords: ["截图", "录屏", "截屏", "screen cap"]
  },
  {
    capability: "archive_management",
    label: { "zh-CN": "压缩包", "en-US": "Archive", "ja-JP": "Archive" },
    tool_candidates: [],
    infer_keywords: ["zip", "rar", "7z", "解压", "压缩包"]
  }
];

/** @type {Map<string, import('./capability.schema.js').CapabilityDefinition>} */
const byId = new Map(CAPABILITIES.map((c) => [c.capability, c]));

function getAllCapabilities() {
  return CAPABILITIES.slice();
}

function getCapability(capId) {
  return byId.get(capId) || null;
}

module.exports = { CAPABILITIES, getAllCapabilities, getCapability };
