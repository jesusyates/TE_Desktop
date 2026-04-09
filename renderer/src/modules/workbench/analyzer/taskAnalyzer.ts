import type { TaskAttachmentMeta } from "../../../types/task";
import type { TaskMode } from "../../../types/taskMode";
import type { MemoryHints } from "../../memory/memoryQuery";
import type { TaskAnalysisResult, TaskIntent } from "./taskAnalyzerTypes";
import type { ContentCapabilitySpec } from "../execution/capabilityStepTypes";
import { recognizeContentCapability } from "../execution/contentCapabilityRecognition";

/** auto 模式下用于 resolvedMode 的操作类关键词（规则版 D-5-5） */
const OPERATIONAL_KEYWORDS =
  /打开|点击|导出|整理|文件|桌面|下载|软件|\bopen\b|\bclick\b|\bexport\b|\borganize\b|\bfile\b|\bfolder\b|\bdesktop\b|\bdownload\b/i;

const INTENT_ORGANIZE_ACTION = /整理|organize|分类|归纳|归整/i;
/** 与「下载/桌面」类表述对齐，避免英文仅说 downloads 漏识 */
const INTENT_FILE_SCOPE = /文件|文件夹|folder|files|\bfile\b|\bdownloads?\b/i;
/** Local Runtime：列目录 / 扫描（须用户选文件夹；与「写长文」类指令互斥） */
const INTENT_SCAN_LIST =
  /扫描|列出|列举|罗列|清单|有哪些文件|目录里|文件夹里|目录内容|list files|file list|\bls\b/i;
const INTENT_TEXT_RULE =
  /去重|删重|重复行|空行|去掉空行|行排序|排序行|\bstrip\b|\bdedupe\b|trim|合并重复|删空白行/i;
const LONG_FORM = /写.*篇|^一篇|文章|文案|脚本|周报|读后感|种草|口播|短视频/i;
/** Local Safe v1：受控重命名（去空格等），须含文件/文件夹语境 */
const INTENT_LOCAL_SAFE_RENAME =
  /重命名|改名|文件名去空格|去掉文件名.*空格|去除.*文件名.*空格|批量命名|\brename\b/i;
/** Local Safe v1：按扩展名/类型归入子目录 */
const INTENT_LOCAL_SAFE_CLASSIFY =
  /按扩展名|按文件类型|按类型分|分门别类|归入.*文件夹|分到.*子文件夹|归类到/i;
const INTENT_LOCAL_TRANSFER_COPY = /复制|拷贝|duplicate/i;
const INTENT_LOCAL_TRANSFER_MOVE = /移动|剪切|挪到|搬移/i;
/** Local Read v1：读文本文件内容（须用户选文件；与「只列目录」区分） */
const INTENT_READ_TEXT_FILE =
  /读取.*文件|读出文件|阅读.*文件|读一下.*文件|打开.*读|查看文件.*内容|显示文件.*内容|读本文件|读取文本|读取txt|\bread (a |the |this )?(text )?file\b|read file contents?|open (a |the )?file.*read/i;

function inferIntent(promptForIntent: string, contentCap: ContentCapabilitySpec | null): TaskIntent {
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
  if (
    INTENT_LOCAL_SAFE_RENAME.test(promptForIntent) &&
    INTENT_FILE_SCOPE.test(promptForIntent) &&
    !LONG_FORM.test(promptForIntent)
  ) {
    return "local_safe_rename";
  }
  if (
    INTENT_LOCAL_SAFE_CLASSIFY.test(promptForIntent) &&
    INTENT_FILE_SCOPE.test(promptForIntent) &&
    (INTENT_LOCAL_TRANSFER_COPY.test(promptForIntent) ||
      INTENT_LOCAL_TRANSFER_MOVE.test(promptForIntent)) &&
    !LONG_FORM.test(promptForIntent)
  ) {
    return "local_safe_classify";
  }
  if (contentCap) {
    return "content_capability";
  }
  return "unknown";
}

function inferMetadata(rawPrompt: string, normalized: string): TaskAnalysisResult["metadata"] {
  const meta: NonNullable<TaskAnalysisResult["metadata"]> = {};
  if (rawPrompt.includes("下载") || /\bdownload\b/i.test(normalized)) {
    meta.targetPath = "Downloads";
  } else if (rawPrompt.includes("桌面") || /\bdesktop\b/i.test(normalized)) {
    meta.targetPath = "Desktop";
  }
  return Object.keys(meta).length ? meta : undefined;
}

function inferLocalSafeMeta(
  rawPrompt: string,
  intent: TaskAnalysisResult["intent"]
): Partial<NonNullable<TaskAnalysisResult["metadata"]>> {
  if (intent !== "local_safe_classify") return {};
  if (INTENT_LOCAL_TRANSFER_COPY.test(rawPrompt)) return { localTransferMode: "copy" };
  if (INTENT_LOCAL_TRANSFER_MOVE.test(rawPrompt)) return { localTransferMode: "move" };
  return { localTransferMode: "move" };
}

export function analyzeTask(input: {
  prompt: string;
  attachments?: TaskAttachmentMeta[];
  requestedMode?: TaskMode;
  /** D-6-3：预留，当前不参与推断；D-6-4 可接入最优路径 */
  memoryHints?: MemoryHints;
}): TaskAnalysisResult {
  void input.memoryHints;
  const rawPrompt = input.prompt.trim();
  const normalizedPrompt = rawPrompt.toLowerCase();
  const requestedMode: TaskMode = input.requestedMode ?? "auto";

  const attachBlob = (input.attachments ?? [])
    .map((a) => `${a.name} ${a.mimeType ?? ""}`.trim())
    .join("\n")
    .toLowerCase();
  const modeInferenceBlob = `${normalizedPrompt}\n${attachBlob}`.trim();

  const contentCap = recognizeContentCapability(rawPrompt);
  const intent = inferIntent(rawPrompt, contentCap);

  let resolvedMode: "content" | "computer";
  if (requestedMode === "content" || requestedMode === "computer") {
    resolvedMode = requestedMode;
  } else if (
    intent === "local_directory_scan" ||
    intent === "local_text_file_read" ||
    intent === "local_safe_rename" ||
    intent === "local_safe_classify"
  ) {
    resolvedMode = "computer";
  } else if (intent === "local_text_transform") {
    resolvedMode = "content";
  } else {
    resolvedMode = OPERATIONAL_KEYWORDS.test(modeInferenceBlob) ? "computer" : "content";
  }

  const candidateCapabilities: string[] =
    intent === "organize_files" ? ["file.organize"] : [];

  const metadataBase = inferMetadata(rawPrompt, normalizedPrompt) ?? {};
  const metadata: NonNullable<TaskAnalysisResult["metadata"]> = {
    ...metadataBase,
    ...inferLocalSafeMeta(rawPrompt, intent),
    ...(contentCap ? { contentCapability: contentCap } : {})
  };
  const metadataOut = Object.keys(metadata).length ? metadata : undefined;

  const shouldExecute =
    intent === "local_directory_scan" ||
    intent === "local_text_file_read" ||
    intent === "local_text_transform" ||
    intent === "local_safe_rename" ||
    intent === "local_safe_classify" ||
    (resolvedMode === "computer" && intent !== "unknown");

  return {
    rawPrompt,
    normalizedPrompt,
    requestedMode,
    resolvedMode,
    intent,
    candidateCapabilities,
    shouldExecute,
    metadata: metadataOut
  };
}
