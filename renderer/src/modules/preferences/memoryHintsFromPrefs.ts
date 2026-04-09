import type { MemoryHintsTemplateContext } from "../memory/memoryTypes";
import type { TaskAnalysisResult } from "../workbench/analyzer/taskAnalyzerTypes";
import { getMemoryHintsForTask, type MemoryHints } from "../memory/memoryQuery";
import type { MemorySnapshot } from "../memory/memoryTypes";
import { loadAppPreferences } from "./appPreferences";

const EMPTY_HINTS: MemoryHints = {
  patternKey: "",
  preferredCapabilityIds: [],
  knownSuccessfulPattern: null,
  lastUsedMode: null
};

export function getMemoryHintsForTaskWithPrefs(
  snapshot: MemorySnapshot,
  analysis: TaskAnalysisResult,
  templateContext: MemoryHintsTemplateContext | null
): MemoryHints {
  if (!loadAppPreferences().memoryTemplate.applyMemoryHintsInTasks) {
    return EMPTY_HINTS;
  }
  return getMemoryHintsForTask(snapshot, analysis, templateContext);
}
