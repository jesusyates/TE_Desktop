/**
 * Local Runtime 收口 v1：统一中文命名（设置 / 步骤 / 结果摘要同源）。
 * 英文界面见 uiCatalog.settings.h1LocalRuntime*。
 */

export const LR_LABEL_GROUP = "本地执行";

export const LR_PHRASE_NO_UPLOAD = "未上传云端";

export const LR_PHRASE_ON_DEVICE = "仅在本机处理";

/** 与人类可读摘要连用：「未上传云端 · 仅在本机处理」 */
export function lrSemanticsSuffix(): string {
  return `${LR_PHRASE_NO_UPLOAD} · ${LR_PHRASE_ON_DEVICE}`;
}

/** Local Safe v1：受控文件写操作步骤标题 */
export function lrLocalFileOpTitle(safeOp: string): string {
  if (safeOp === "rename_strip_spaces") return `${LR_LABEL_GROUP} · 文件重命名（去空格）`;
  if (safeOp === "classify_by_extension") return `${LR_LABEL_GROUP} · 按扩展名分类`;
  return `${LR_LABEL_GROUP} · 本地文件`;
}

export type LocalRuntimeStepKind = "local_scan" | "local_read" | "local_text_transform";

export function lrStepGroupTitle(kind: LocalRuntimeStepKind): string {
  switch (kind) {
    case "local_scan":
      return `${LR_LABEL_GROUP} · 目录扫描`;
    case "local_read":
      return `${LR_LABEL_GROUP} · 文本读取`;
    case "local_text_transform":
      return `${LR_LABEL_GROUP} · 文本规则处理`;
  }
}

export function lrStepDescription(kind: LocalRuntimeStepKind, rule?: string): string {
  const tail = lrSemanticsSuffix();
  switch (kind) {
    case "local_scan":
      return `请选择文件夹，列出条目信息。${tail}。`;
    case "local_read":
      return `请选择受支持的文本类文件，只读载入。${tail}。`;
    case "local_text_transform": {
      const r = ruleLabelZh(rule?.trim() || "trim_lines");
      return `在本机按规则处理文本（${r}）。${tail}。`;
    }
  }
}

export function ruleLabelZh(rule: string): string {
  switch (rule) {
    case "dedupe_lines":
      return "去重";
    case "strip_empty_lines":
      return "去空行";
    case "sort_lines":
      return "行排序";
    case "trim_lines":
      return "行尾修剪";
    default:
      return rule;
  }
}

/** 本地读取失败：与主进程日志码对齐的用户可见句 */
export const LR_ERR_UNSUPPORTED_TYPE = "不支持读取该文件类型";

export const LR_ERR_BINARY = "检测到二进制内容，无法按文本读取";

export const LR_ERR_TOO_LARGE = "文件过大，暂不支持读取";

/** 流水线汇总块标题（与步骤类型一致） */
export function lrPlanStepAggregateHeader(
  stepType: "local_scan" | "local_read" | "local_text_transform" | "local_file_operation",
  resultTitle: string,
  stepTitle: string
): string {
  const head =
    stepType === "local_file_operation" ? `${LR_LABEL_GROUP} · 本地文件` : lrStepGroupTitle(stepType);
  return `[${head}] ${(resultTitle || stepTitle).trim()}`;
}

export function mapLocalRuntimeLogsToUserMessage(logs: string[]): string {
  for (const line of logs) {
    if (typeof line !== "string") continue;
    if (line.startsWith("disallowed_extension:")) return LR_ERR_UNSUPPORTED_TYPE;
    if (line === "binary_content_rejected") return LR_ERR_BINARY;
    if (line.startsWith("file_too_large:")) return LR_ERR_TOO_LARGE;
  }
  if (logs.some((l) => typeof l === "string" && l.includes("user_canceled"))) return "已取消";
  return logs.filter((l) => typeof l === "string" && l.trim())[0]?.trim() || "本地执行未完成";
}
