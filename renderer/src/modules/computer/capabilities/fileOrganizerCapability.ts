import { analyzeTask } from "../../workbench/analyzer/taskAnalyzer";
import { runFileOrganizerTask } from "../executors/fileOrganizerExecutor";
import { resolveOrganizeTargetPath } from "../lib/fileOrganizeIntent";
import type { ComputerCapability } from "./capabilityTypes";

/**
 * id: file.organize — 按类型整理 Desktop / Downloads 根目录下文件。
 * match 仅委托给 analyzeTask，与架构「八、Task Analyzer」一致（词表不重复维护）。
 */
export const fileOrganizerCapability: ComputerCapability = {
  id: "file.organize",
  name: "文件整理",
  description: "扫描并按类型分类、重命名、移动到子文件夹（本地）",
  priority: 10,
  match: (input) =>
    analyzeTask({
      prompt: input.prompt,
      attachments: input.attachments,
      requestedMode: "auto"
    }).candidateCapabilities.includes("file.organize"),
  run: async (input, emitEvent) => {
    await runFileOrganizerTask(
      { targetPath: resolveOrganizeTargetPath(input.prompt), strategy: "byType" },
      emitEvent
    );
  }
};
