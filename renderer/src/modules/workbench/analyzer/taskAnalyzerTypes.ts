import type { TaskMode } from "../../../types/taskMode";
import type { StylePreferencesSnapshot } from "../../../types/stylePreferences";
import type { ContentCapabilitySpec } from "../execution/capabilityStepTypes";

export type TaskIntent =
  | "organize_files"
  | "content_capability"
  /** Local Runtime v1：目录扫描（须用户选文件夹） */
  | "local_directory_scan"
  /** Local Runtime v1：纯本地文本规则处理 */
  | "local_text_transform"
  /** Local Read v1：用户选中文本文件只读载入（无写、无上传） */
  | "local_text_file_read"
  /** Local Safe v1：受控重命名（选目录 + 确认） */
  | "local_safe_rename"
  /** Local Safe v1：按扩展名归类子目录（移动/复制 + 确认） */
  | "local_safe_classify"
  | "unknown";

/** E-3：Core 模板 content 进入分析/执行上下文的结构化片段 */
export type TemplateExecutionContext = {
  templateId: string;
  sourcePrompt: string;
  requestedMode: TaskMode;
  stepsSnapshot: unknown[];
  resultSnapshot?: unknown;
  sourceResultKind?: string;
};

export interface TaskAnalysisResult {
  rawPrompt: string;
  normalizedPrompt: string;

  requestedMode: TaskMode;
  resolvedMode: "content" | "computer";

  intent: TaskIntent;

  /** capability ids（由 intent 推导，供 resolveCapabilityFromCandidates） */
  candidateCapabilities: string[];

  shouldExecute: boolean;

  metadata?: {
    /** Local Safe v1：classify 步骤使用复制或移动 */
    localTransferMode?: "move" | "copy";
    targetPath?: "Desktop" | "Downloads";
    /** D-4：Core 组装的轻量记忆参考行（非全文、有上限） */
    memoryReferenceLines?: string[];
    /** E-3：模板自 Core 注入的执行上下文（占位生成等可消费） */
    templateExecutionContext?: TemplateExecutionContext;
    /** F-2A：内容内受控 capability（去重 / 提链 / 编号列表等） */
    contentCapability?: ContentCapabilitySpec;
  };

  /** D-7-5B：用户风格偏好快照（随任务进入会话；服务端可忽略） */
  stylePreferences?: StylePreferencesSnapshot;
}
