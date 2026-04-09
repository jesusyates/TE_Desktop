import type { TaskAnalysisResult } from "../analyzer/taskAnalyzerTypes";

export function isLocalRuntimeIntent(intent: TaskAnalysisResult["intent"]): boolean {
  return (
    intent === "local_directory_scan" ||
    intent === "local_text_file_read" ||
    intent === "local_text_transform" ||
    intent === "local_safe_rename" ||
    intent === "local_safe_classify"
  );
}
