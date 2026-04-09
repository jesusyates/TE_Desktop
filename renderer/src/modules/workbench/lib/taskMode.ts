import type { TaskAttachmentMeta } from "../../../types/task";
import type { ResolvedTaskMode, TaskMode } from "../../../types/taskMode";
import { analyzeTask } from "../analyzer/taskAnalyzer";

export type ResolveTaskModeInput = {
  prompt: string;
  attachments?: TaskAttachmentMeta[];
  userSelectedMode?: TaskMode;
};

/**
 * @deprecated 新代码请直接使用 analyzeTask；本函数仅委托 Analyzer，避免第二套 mode 词表。
 */
export function resolveTaskMode(input: ResolveTaskModeInput): ResolvedTaskMode {
  return analyzeTask({
    prompt: input.prompt,
    attachments: input.attachments,
    requestedMode: input.userSelectedMode ?? "auto"
  }).resolvedMode;
}
