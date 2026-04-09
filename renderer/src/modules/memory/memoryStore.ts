import type { MemorySnapshot } from "./memoryTypes";
import { trimBehaviorLogForPolicy } from "../../services/localCachePolicy";
import { decodeLocalStorageDocument, encodeLocalStorageDocument } from "../../services/localDataSafety";

export const MEMORY_STORAGE_KEY = "aics.memory.v1";
const MAX_EXAMPLES_PER_PATTERN = 8;

export function getInitialMemorySnapshot(): MemorySnapshot {
  return {
    behaviorLog: [],
    capabilityStats: [],
    taskPatterns: []
  };
}

export function loadMemorySnapshot(): MemorySnapshot {
  if (typeof window === "undefined") return getInitialMemorySnapshot();
  try {
    const raw = window.localStorage.getItem(MEMORY_STORAGE_KEY);
    if (!raw) return getInitialMemorySnapshot();
    const parsed = decodeLocalStorageDocument<Partial<MemorySnapshot>>(raw, "memory");
    if (!parsed || typeof parsed !== "object") return getInitialMemorySnapshot();
    return {
      behaviorLog: Array.isArray(parsed.behaviorLog) ? parsed.behaviorLog : [],
      capabilityStats: Array.isArray(parsed.capabilityStats) ? parsed.capabilityStats : [],
      taskPatterns: Array.isArray(parsed.taskPatterns) ? parsed.taskPatterns : []
    };
  } catch {
    return getInitialMemorySnapshot();
  }
}

export function saveMemorySnapshot(snapshot: MemorySnapshot): void {
  if (typeof window === "undefined") return;
  const trimmed: MemorySnapshot = {
    ...snapshot,
    behaviorLog: trimBehaviorLogForPolicy(snapshot.behaviorLog)
  };
  trimmed.taskPatterns = trimmed.taskPatterns.map((p) => ({
    ...p,
    promptExamples: p.promptExamples.slice(-MAX_EXAMPLES_PER_PATTERN)
  }));
  window.localStorage.setItem(MEMORY_STORAGE_KEY, encodeLocalStorageDocument(trimmed));
}
