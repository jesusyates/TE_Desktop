/**
 * D-7-3B：与桌面端 taskAnalyzer.ts 规则对齐的规则版 Analyzer（无模型）。
 * D-4：可选 `memoryHints`（Workbench 经正式 /memory 契约组装，轻量）。
 */

const OPERATIONAL_KEYWORDS =
  /打开|点击|导出|整理|文件|桌面|下载|软件|\bopen\b|\bclick\b|\bexport\b|\borganize\b|\bfile\b|\bfolder\b|\bdesktop\b|\bdownload\b/i;

const INTENT_ORGANIZE_ACTION = /整理|organize|分类|归纳|归整/i;
const INTENT_FILE_SCOPE = /文件|文件夹|folder|files|\bfile\b|\bdownloads?\b/i;
const INTENT_SCAN_LIST =
  /扫描|列出|列举|罗列|清单|有哪些文件|目录里|文件夹里|目录内容|list files|file list|\bls\b/i;
const INTENT_TEXT_RULE =
  /去重|删重|重复行|空行|去掉空行|行排序|排序行|\bstrip\b|\bdedupe\b|trim|合并重复|删空白行/i;
const LONG_FORM = /写.*篇|^一篇|文章|文案|脚本|周报|读后感|种草|口播|短视频/i;
const INTENT_READ_TEXT_FILE =
  /读取.*文件|读出文件|阅读.*文件|读一下.*文件|打开.*读|查看文件.*内容|显示文件.*内容|读本文件|读取文本|读取txt|\bread (a |the |this )?(text )?file\b|read file contents?|open (a |the )?file.*read/i;

/** @param {unknown} raw */
function sanitizeMemoryHints(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  /** @type {Record<string, unknown>} */
  const out = {};
  if (o.preferredMode === "content" || o.preferredMode === "computer") {
    out.preferredMode = o.preferredMode;
  }
  if (Array.isArray(o.hintLines)) {
    const lines = o.hintLines
      .filter((x) => typeof x === "string")
      .map((x) => String(x).trim().slice(0, 120))
      .filter(Boolean)
      .slice(0, 3);
    if (lines.length) out.hintLines = lines;
  }
  if (o.styleSummary && typeof o.styleSummary === "object" && !Array.isArray(o.styleSummary)) {
    const ssIn = /** @type {Record<string, unknown>} */ (o.styleSummary);
    /** @type {Record<string, string>} */
    const ss = {};
    for (const [k, v] of Object.entries(ssIn)) {
      if (typeof v !== "string") continue;
      const t = v.trim();
      if (!t) continue;
      if (k === "outputLength" && (t === "short" || t === "medium" || t === "long")) {
        ss.outputLength = t;
      } else if (["tone", "audience", "languagePreference", "notes"].includes(k)) {
        ss[k] = t.slice(0, 200);
      }
    }
    if (Object.keys(ss).length) out.styleSummary = ss;
  }
  if (typeof o.platformHint === "string" && o.platformHint.trim()) {
    out.platformHint = o.platformHint.trim().slice(0, 120);
  }
  if (o.templatePreference && typeof o.templatePreference === "object") {
    const tp = /** @type {Record<string, unknown>} */ (o.templatePreference);
    /** @type {Record<string, string>} */
    const t = {};
    if (typeof tp.templateId === "string" && tp.templateId.trim()) t.templateId = tp.templateId.trim().slice(0, 64);
    if (typeof tp.workflowType === "string" && tp.workflowType.trim())
      t.workflowType = tp.workflowType.trim().slice(0, 64);
    if (typeof tp.platform === "string" && tp.platform.trim()) t.platform = tp.platform.trim().slice(0, 64);
    if (Object.keys(t).length) out.templatePreference = t;
  }
  return Object.keys(out).length ? out : null;
}

/** @param {Record<string, unknown> | null} memoryHints */
function buildMemoryReferenceLines(memoryHints) {
  if (!memoryHints) return [];
  const lines = [];
  const hl = memoryHints.hintLines;
  if (Array.isArray(hl)) {
    for (const x of hl) {
      if (typeof x === "string" && x.trim()) lines.push(x.trim());
    }
  }
  if (typeof memoryHints.platformHint === "string" && memoryHints.platformHint.trim()) {
    lines.push(`平台：${memoryHints.platformHint.trim()}`);
  }
  const tp = memoryHints.templatePreference;
  if (tp && typeof tp === "object") {
    const t = /** @type {Record<string, string>} */ (tp);
    const parts = [];
    if (t.templateId) parts.push(`模板 ${t.templateId}`);
    if (t.workflowType) parts.push(t.workflowType);
    if (t.platform) parts.push(t.platform);
    if (parts.length) lines.push(parts.join(" · "));
  }
  return lines.slice(0, 5);
}

/** @param {Record<string, unknown> | null} memoryHints */
function stylePreferencesFromHints(memoryHints) {
  if (!memoryHints || !memoryHints.styleSummary || typeof memoryHints.styleSummary !== "object") return undefined;
  const ss = /** @type {Record<string, string>} */ (memoryHints.styleSummary);
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(ss)) {
    if (typeof v !== "string" || !v.trim()) continue;
    if (k === "outputLength" && (v === "short" || v === "medium" || v === "long")) out.outputLength = v;
    else if (["tone", "audience", "languagePreference", "notes"].includes(k)) out[k] = v.trim().slice(0, 500);
  }
  return Object.keys(out).length ? out : undefined;
}

function inferIntent(promptForIntent) {
  if (INTENT_ORGANIZE_ACTION.test(promptForIntent) && INTENT_FILE_SCOPE.test(promptForIntent)) {
    return "organize_files";
  }
  if (
    INTENT_SCAN_LIST.test(promptForIntent) &&
    INTENT_FILE_SCOPE.test(promptForIntent) &&
    !LONG_FORM.test(promptForIntent)
  ) {
    return "local_directory_scan";
  }
  if (
    INTENT_READ_TEXT_FILE.test(promptForIntent) &&
    (INTENT_FILE_SCOPE.test(promptForIntent) || /\.(txt|md|json|csv|log)\b/i.test(promptForIntent)) &&
    !LONG_FORM.test(promptForIntent)
  ) {
    return "local_text_file_read";
  }
  if (INTENT_TEXT_RULE.test(promptForIntent) && !LONG_FORM.test(promptForIntent)) {
    return "local_text_transform";
  }
  return "unknown";
}

function inferMetadata(rawPrompt, normalized) {
  const meta = {};
  if (rawPrompt.includes("下载") || /\bdownload\b/i.test(normalized)) {
    meta.targetPath = "Downloads";
  } else if (rawPrompt.includes("桌面") || /\bdesktop\b/i.test(normalized)) {
    meta.targetPath = "Desktop";
  }
  return Object.keys(meta).length ? meta : undefined;
}

/**
 * @param {object} body
 * @param {string} body.prompt
 * @param {"auto" | "content" | "computer"} [body.requestedMode]
 * @param {Array<{ name?: string; mimeType?: string; size?: number }>} [body.attachments]
 */
function analyzeTaskCore(body) {
  const rawPrompt = String(body.prompt ?? "").trim();
  const normalizedPrompt = rawPrompt.toLowerCase();
  const rm = body.requestedMode;
  const requestedMode = rm === "content" || rm === "computer" ? rm : "auto";

  const attachBlob = (Array.isArray(body.attachments) ? body.attachments : [])
    .map((a) => `${a.name ?? ""} ${a.mimeType ?? ""}`.trim())
    .join("\n")
    .toLowerCase();
  const modeInferenceBlob = `${normalizedPrompt}\n${attachBlob}`.trim();

  const memoryHints = sanitizeMemoryHints(body.memoryHints);

  const intent = inferIntent(rawPrompt);
  let resolvedMode;
  if (requestedMode === "content" || requestedMode === "computer") {
    resolvedMode = requestedMode;
  } else if (
    memoryHints &&
    (memoryHints.preferredMode === "content" || memoryHints.preferredMode === "computer")
  ) {
    resolvedMode = /** @type {"content" | "computer"} */ (memoryHints.preferredMode);
  } else if (intent === "local_directory_scan" || intent === "local_text_file_read") {
    resolvedMode = "computer";
  } else if (intent === "local_text_transform") {
    resolvedMode = "content";
  } else {
    resolvedMode = OPERATIONAL_KEYWORDS.test(modeInferenceBlob) ? "computer" : "content";
  }

  const candidateCapabilities = intent === "organize_files" ? ["file.organize"] : [];
  let metadata = inferMetadata(rawPrompt, normalizedPrompt);
  const memLines = buildMemoryReferenceLines(memoryHints);
  if (memLines.length) {
    metadata = { ...(metadata || {}), memoryReferenceLines: memLines };
  }
  const shouldExecute =
    intent === "local_directory_scan" ||
    intent === "local_text_file_read" ||
    intent === "local_text_transform" ||
    (resolvedMode === "computer" && intent !== "unknown");
  const stylePreferences = stylePreferencesFromHints(memoryHints);

  /** @type {Record<string, unknown>} */
  const out = {
    rawPrompt,
    normalizedPrompt,
    requestedMode,
    resolvedMode,
    intent,
    candidateCapabilities,
    shouldExecute,
    metadata: metadata && Object.keys(metadata).length ? metadata : undefined
  };
  if (stylePreferences) out.stylePreferences = stylePreferences;
  return out;
}

module.exports = { analyzeTaskCore, sanitizeMemoryHints };
