/**
 * D-7-4K：本地 MemorySnapshot → 结构化 MemoryHintsSnapshot（仅归一与聚合，无 I/O）。
 */

import type { ResolvedTaskMode } from "../../types/taskMode";
import type {
  CapabilityUsageMemory,
  MemoryFailureType,
  MemoryHintsSnapshot,
  MemoryItemVM,
  MemorySnapshot,
  MemorySuccessQuality,
  RecentFailureCapabilityBrief,
  RecentFailurePatternBrief,
  RecentFailureTypeBrief,
  TaskPatternMemory,
  UserBehaviorMemory
} from "./memoryTypes";

const QUALITY_RANK: Record<MemorySuccessQuality, number> = {
  high: 3,
  medium: 2,
  low: 1
};

function maxExecutionQualityRankByCapability(snapshot: MemorySnapshot): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of snapshot.behaviorLog) {
    const q = b.executionSuccessSignal?.successQuality;
    if (!b.success || !q) continue;
    const rank = QUALITY_RANK[q];
    for (const id of b.capabilityIds) {
      const prev = m.get(id) ?? 0;
      if (rank > prev) m.set(id, rank);
    }
  }
  return m;
}

function patternRowQualityRank(snapshot: MemorySnapshot, patternKey: string): number {
  let max = 0;
  for (const b of snapshot.behaviorLog) {
    if (!b.success || b.executionSuccessSignal?.patternKey !== patternKey) continue;
    const q = b.executionSuccessSignal?.successQuality;
    if (!q) continue;
    const r = QUALITY_RANK[q];
    if (r > max) max = r;
  }
  return max;
}

const RECENT_CONTEXT_LIMIT = 50;

function patternKeyFromBehavior(b: UserBehaviorMemory): string {
  return `${b.resolvedMode}:${b.intent}`;
}

/** D-7-4R：与 recentContext 同窗口，只聚合带 failureSignal 的失败行 */
function aggregateRecentFailureViews(snapshot: MemorySnapshot): {
  recentFailurePatterns: RecentFailurePatternBrief[];
  recentFailureCapabilities: RecentFailureCapabilityBrief[];
  recentFailureTypes: RecentFailureTypeBrief[];
} {
  const window = snapshot.behaviorLog.slice(-RECENT_CONTEXT_LIMIT);
  const patternFail = new Map<string, { failureCount: number; lastFailureAt: string }>();
  const capFail = new Map<string, number>();
  const capSucc = new Map<string, number>();
  const capLastFail = new Map<string, string>();
  const typeCount = new Map<MemoryFailureType, number>();

  for (const b of window) {
    if (b.success) {
      for (const id of b.capabilityIds) {
        capSucc.set(id, (capSucc.get(id) ?? 0) + 1);
      }
      continue;
    }
    if (!b.failureSignal) continue;

    const pk = (b.failureSignal.patternKey?.trim() || patternKeyFromBehavior(b)).trim();
    const pe = patternFail.get(pk) ?? { failureCount: 0, lastFailureAt: b.timestamp };
    patternFail.set(pk, {
      failureCount: pe.failureCount + 1,
      lastFailureAt: b.timestamp > pe.lastFailureAt ? b.timestamp : pe.lastFailureAt
    });

    for (const id of b.capabilityIds) {
      capFail.set(id, (capFail.get(id) ?? 0) + 1);
      const prev = capLastFail.get(id);
      if (!prev || b.timestamp >= prev) capLastFail.set(id, b.timestamp);
    }

    const ft = b.failureSignal.failureType;
    typeCount.set(ft, (typeCount.get(ft) ?? 0) + 1);
  }

  const recentFailurePatterns: RecentFailurePatternBrief[] = [...patternFail.entries()]
    .map(([patternKey, v]) => ({
      patternKey,
      failureCount: v.failureCount,
      lastFailureAt: v.lastFailureAt
    }))
    .sort((a, b) => b.lastFailureAt.localeCompare(a.lastFailureAt));

  const recentFailureCapabilities: RecentFailureCapabilityBrief[] = [...capFail.entries()].map(
    ([capabilityId, failureCount]) => ({
      capabilityId,
      failureCount,
      successCount: capSucc.get(capabilityId) ?? 0,
      lastFailureAt: capLastFail.get(capabilityId) ?? ""
    })
  );
  recentFailureCapabilities.sort((a, b) => b.lastFailureAt.localeCompare(a.lastFailureAt));

  const recentFailureTypes: RecentFailureTypeBrief[] = [...typeCount.entries()]
    .map(([failureType, count]) => ({ failureType, count }))
    .sort((a, b) => b.count - a.count);

  return { recentFailurePatterns, recentFailureCapabilities, recentFailureTypes };
}

function intentFromPatternKey(patternKey: string): string {
  const i = patternKey.indexOf(":");
  return i >= 0 ? patternKey.slice(i + 1) : "unknown";
}

function behaviorToRecentContextItem(b: UserBehaviorMemory): MemoryItemVM {
  return {
    id: b.id,
    type: "recent_context",
    prompt: b.prompt,
    resolvedMode: b.resolvedMode,
    intent: b.intent,
    capabilityIds: [...b.capabilityIds],
    success: b.success,
    createdAt: b.timestamp
  };
}

function patternToSuccessfulPatternItem(p: TaskPatternMemory): MemoryItemVM {
  const prompt = p.promptExamples.length ? p.promptExamples[p.promptExamples.length - 1]! : "";
  return {
    id: `pattern:${p.patternKey}`,
    type: "successful_pattern",
    prompt,
    resolvedMode: p.preferredMode,
    intent: intentFromPatternKey(p.patternKey),
    capabilityIds: [...p.preferredCapabilityIds],
    success: p.successCount > 0,
    createdAt: p.lastUsedAt,
    patternKey: p.patternKey,
    successCount: p.successCount,
    promptExamples: [...p.promptExamples]
  };
}

function computePreferredModes(snapshot: MemorySnapshot): ResolvedTaskMode[] {
  const set = new Set<ResolvedTaskMode>();
  for (const p of snapshot.taskPatterns) {
    if (p.successCount > 0) set.add(p.preferredMode);
  }
  for (const b of snapshot.behaviorLog.slice(-30)) {
    if (b.success) set.add(b.resolvedMode);
  }
  return [...set];
}

function buildPreferenceItems(modes: ResolvedTaskMode[], snapshot: MemorySnapshot): MemoryItemVM[] {
  const latestTs: Partial<Record<ResolvedTaskMode, string>> = {};
  for (const b of snapshot.behaviorLog) {
    if (!b.success) continue;
    const prev = latestTs[b.resolvedMode];
    if (!prev || b.timestamp > prev) latestTs[b.resolvedMode] = b.timestamp;
  }
  const fallbackTs = new Date().toISOString();
  return modes.map((mode) => ({
    id: `preference:${mode}`,
    type: "preference",
    prompt: "",
    resolvedMode: mode,
    intent: "unknown",
    capabilityIds: [],
    success: true,
    createdAt: latestTs[mode] ?? fallbackTs
  }));
}

function computeSuccessfulCapabilities(snapshot: MemorySnapshot): string[] {
  const qRank = maxExecutionQualityRankByCapability(snapshot);
  return [...snapshot.capabilityStats]
    .filter((c) => c.successCount > 0)
    .sort((a, b) => {
      const qa = qRank.get(a.capabilityId) ?? 0;
      const qb = qRank.get(b.capabilityId) ?? 0;
      if (qb !== qa) return qb - qa;
      return b.successCount - a.successCount || b.usedCount - a.usedCount;
    })
    .map((c) => c.capabilityId);
}

/** 将能力统计归一为 capability_signal 条目（可选用于调试/后续 UI；当前不并入 snapshot 四字段） */
export function memoryCapabilityStatsToSignalItems(stats: CapabilityUsageMemory[]): MemoryItemVM[] {
  return stats
    .filter((c) => c.usedCount > 0)
    .map((c) => ({
      id: `capability_signal:${c.capabilityId}`,
      type: "capability_signal" as const,
      prompt: "",
      resolvedMode: "content" as ResolvedTaskMode,
      intent: "unknown",
      capabilityIds: [c.capabilityId],
      success: c.successCount > 0,
      createdAt: c.lastUsedAt,
      successCount: c.successCount
    }));
}

/**
 * 构建供 getMemoryHintsForTask 使用的结构化快照（本地优先，同步，可缓存）。
 */
export function buildMemorySnapshotForTaskHints(snapshot: MemorySnapshot): MemoryHintsSnapshot {
  const recentRaw = snapshot.behaviorLog.slice(-RECENT_CONTEXT_LIMIT).reverse();
  const recentContext = recentRaw.map(behaviorToRecentContextItem);

  const successfulPatternItems = snapshot.taskPatterns
    .filter((p) => p.successCount > 0)
    .sort((a, b) => patternRowQualityRank(snapshot, b.patternKey) - patternRowQualityRank(snapshot, a.patternKey))
    .map(patternToSuccessfulPatternItem);

  const preferredModes = computePreferredModes(snapshot);
  const preferenceItems = buildPreferenceItems(preferredModes, snapshot);

  const successfulCapabilities = computeSuccessfulCapabilities(snapshot);
  const failureViews = aggregateRecentFailureViews(snapshot);

  return {
    recentContext,
    preferredModes,
    successfulCapabilities,
    recentSuccessfulPatterns: [...successfulPatternItems, ...preferenceItems],
    ...failureViews
  };
}
