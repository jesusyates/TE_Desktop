import type { TaskAnalysisResult } from "../workbench/analyzer/taskAnalyzerTypes";
import type {
  MemoryHintsSnapshot,
  MemoryHintsTemplateContext,
  MemoryItemVM,
  MemorySnapshot,
  RecentFailureCapabilityBrief,
  TaskPatternMemory,
  UserBehaviorMemory
} from "./memoryTypes";
import { userBehaviorMemoryToSignalDomain } from "../../domain/mappers/userBehaviorMemoryMapper";
import type { MemorySignalDomainModel } from "../../domain/models/memorySignalDomainModel";
import { buildMemorySnapshotForTaskHints } from "./memorySnapshotBuilder";
import { loadMemorySnapshot } from "./memoryStore";
import { mapWorkflowTypeToResolvedMode } from "./memoryTemplateSignals";

export type MemoryHints = {
  patternKey: string;
  preferredCapabilityIds: string[];
  knownSuccessfulPattern: TaskPatternMemory | null;
  lastUsedMode: TaskAnalysisResult["resolvedMode"] | null;
};

export type {
  MemoryFailureSignal,
  MemoryFailureType,
  MemoryHintsSnapshot,
  MemoryHintsTemplateContext,
  MemoryItemVM,
  MemorySuccessQuality,
  RecentFailureCapabilityBrief,
  RecentFailurePatternBrief,
  RecentFailureTypeBrief
} from "./memoryTypes";
export type { MemorySignalDomainModel } from "../../domain/models/memorySignalDomainModel";
export { buildMemorySnapshotForTaskHints } from "./memorySnapshotBuilder";

export function patternKeyFromAnalysis(analysis: TaskAnalysisResult): string {
  return `${analysis.resolvedMode}:${analysis.intent}`;
}

export function getCapabilitySuccessRate(
  snapshot: MemorySnapshot,
  capabilityId: string
): number | null {
  const row = snapshot.capabilityStats.find((c) => c.capabilityId === capabilityId);
  if (!row || row.usedCount === 0) return null;
  return row.successCount / row.usedCount;
}

export function getPreferredCapabilitiesForPattern(
  snapshot: MemorySnapshot,
  patternKey: string
): string[] {
  const structured = buildMemorySnapshotForTaskHints(snapshot);
  if (shouldDemotePatternTrustedCaps(structured, patternKey, snapshot)) return [];
  const hit = findSuccessfulPatternRow(structured, patternKey);
  return hit && hit.capabilityIds.length ? [...hit.capabilityIds] : [];
}

export function getRecentBehaviorLogs(snapshot: MemorySnapshot, limit = 20): typeof snapshot.behaviorLog {
  const n = Math.min(Math.max(limit, 1), 100);
  return snapshot.behaviorLog.slice(-n).reverse();
}

/**
 * D-7-4L：在 `successfulCapabilities` 中出现过的候选提前（按成功列表顺序），其余保持 candidates 原相对顺序。
 */
function orderCandidateCapabilities(candidates: string[], successfulCapabilities: string[]): string[] {
  if (candidates.length === 0) return [];
  const rank = new Map<string, number>();
  successfulCapabilities.forEach((id, i) => {
    if (!rank.has(id)) rank.set(id, i);
  });
  const hit: string[] = [];
  const miss: string[] = [];
  for (const id of candidates) {
    if (rank.has(id)) hit.push(id);
    else miss.push(id);
  }
  hit.sort((a, b) => rank.get(a)! - rank.get(b)!);
  return [...hit, ...miss];
}

function findSuccessfulPatternRow(structured: MemoryHintsSnapshot, patternKey: string): MemoryItemVM | null {
  return (
    structured.recentSuccessfulPatterns.find(
      (i) => i.type === "successful_pattern" && i.patternKey === patternKey
    ) ?? null
  );
}

/** D-7-4R：与 snapshot 聚合同窗口思想（50 条），用于失败/成功并列比较 */
const FAILURE_HINT_WINDOW = 50;

function recentSuccessCountForPattern(snapshot: MemorySnapshot, patternKey: string): number {
  const window = snapshot.behaviorLog.slice(-FAILURE_HINT_WINDOW);
  let n = 0;
  for (const b of window) {
    if (!b.success) continue;
    if (`${b.resolvedMode}:${b.intent}` === patternKey) n += 1;
  }
  return n;
}

/**
 * D-7-4R：同一 pattern 在窗口内多次失败且失败多于成功 → 不信任 taskPattern 下发的 cap 顺序（降权，非否决）。
 */
function shouldDemotePatternTrustedCaps(
  structured: MemoryHintsSnapshot,
  patternKey: string,
  rawSnapshot: MemorySnapshot
): boolean {
  const row = structured.recentFailurePatterns.find((p) => p.patternKey === patternKey);
  const failN = row?.failureCount ?? 0;
  if (failN < 2) return false;
  const succN = recentSuccessCountForPattern(rawSnapshot, patternKey);
  return failN > succN;
}

/**
 * D-7-4R：无「成功 pattern / 模板」兜底时，把近期失败占优的 cap 移到列表后部。
 */
function deprioritizeFailureHeavyCapabilities(ids: string[], structured: MemoryHintsSnapshot): string[] {
  if (ids.length <= 1) return ids;
  const map = new Map<string, RecentFailureCapabilityBrief>(
    structured.recentFailureCapabilities.map((c) => [c.capabilityId, c])
  );
  const heavy = new Set<string>();
  for (const id of ids) {
    const c = map.get(id);
    if (!c) continue;
    if (c.failureCount >= 2 && c.failureCount > c.successCount) heavy.add(id);
  }
  if (!heavy.size) return ids;
  const front: string[] = [];
  const back: string[] = [];
  for (const id of ids) {
    (heavy.has(id) ? back : front).push(id);
  }
  return [...front, ...back];
}

function findLatestTemplateSavedSignal(snapshot: MemorySnapshot, templateId: string): UserBehaviorMemory | null {
  const tid = templateId.trim();
  if (!tid) return null;
  for (let i = snapshot.behaviorLog.length - 1; i >= 0; i--) {
    const b = snapshot.behaviorLog[i]!;
    if (b.templateSignal?.source === "template_saved" && b.templateSignal.templateId === tid) {
      return b;
    }
  }
  return null;
}

function memoryItemToTaskPattern(item: MemoryItemVM): TaskPatternMemory {
  return {
    patternKey: item.patternKey ?? "",
    promptExamples:
      item.promptExamples && item.promptExamples.length
        ? [...item.promptExamples]
        : item.prompt
          ? [item.prompt]
          : [],
    preferredMode: item.resolvedMode,
    preferredCapabilityIds: [...item.capabilityIds],
    successCount: item.successCount ?? (item.success ? 1 : 0),
    lastUsedAt: item.createdAt
  };
}

function getMemoryHintsFromSnapshot(
  structured: MemoryHintsSnapshot,
  analysis: TaskAnalysisResult,
  templateContext: MemoryHintsTemplateContext | null,
  rawSnapshot: MemorySnapshot
): MemoryHints {
  const patternKey = patternKeyFromAnalysis(analysis);
  const patternRow = findSuccessfulPatternRow(structured, patternKey);

  const savedTpl = templateContext ? findLatestTemplateSavedSignal(rawSnapshot, templateContext.templateId) : null;

  let knownSuccessfulPattern: TaskPatternMemory | null =
    patternRow && patternRow.success && (patternRow.successCount ?? 0) > 0
      ? memoryItemToTaskPattern(patternRow)
      : null;

  if (
    knownSuccessfulPattern == null &&
    savedTpl?.templateSignal?.source === "template_saved" &&
    savedTpl.capabilityIds.length > 0
  ) {
    knownSuccessfulPattern = {
      patternKey,
      promptExamples: savedTpl.prompt.trim() ? [savedTpl.prompt.trim()] : [],
      preferredMode: savedTpl.resolvedMode,
      preferredCapabilityIds: [...savedTpl.capabilityIds],
      successCount: 1,
      lastUsedAt: savedTpl.timestamp
    };
  }

  const patternCapsDemoted = shouldDemotePatternTrustedCaps(structured, patternKey, rawSnapshot);

  let preferredFromPattern: string[] = [];
  let trustedPatternOrTemplateCaps = false;

  if (patternRow && patternRow.capabilityIds.length > 0 && !patternCapsDemoted) {
    preferredFromPattern = [...patternRow.capabilityIds];
    trustedPatternOrTemplateCaps = true;
  }

  if (
    preferredFromPattern.length === 0 &&
    savedTpl?.templateSignal?.source === "template_saved" &&
    savedTpl.capabilityIds.length > 0
  ) {
    preferredFromPattern = [...savedTpl.capabilityIds];
    trustedPatternOrTemplateCaps = true;
  }

  const candidates = [...(analysis.candidateCapabilities ?? [])];
  let preferredCapabilityIds =
    preferredFromPattern.length > 0
      ? preferredFromPattern
      : orderCandidateCapabilities(candidates, structured.successfulCapabilities);

  if (!trustedPatternOrTemplateCaps) {
    preferredCapabilityIds = deprioritizeFailureHeavyCapabilities(preferredCapabilityIds, structured);
  }

  const lastMatch = structured.recentContext.find(
    (i) => i.type === "recent_context" && i.intent === analysis.intent
  );

  let lastUsedMode = lastMatch ? lastMatch.resolvedMode : null;
  if (lastUsedMode == null && savedTpl) {
    lastUsedMode = savedTpl.resolvedMode;
  }
  if (lastUsedMode == null && templateContext?.workflowType) {
    lastUsedMode = mapWorkflowTypeToResolvedMode(templateContext.workflowType);
  }
  if (lastUsedMode == null && structured.preferredModes.length > 0) {
    lastUsedMode = structured.preferredModes[0] ?? null;
  }

  return {
    patternKey,
    preferredCapabilityIds,
    knownSuccessfulPattern,
    lastUsedMode
  };
}

/**
 * D-7-4K：入口签名不变；内部先将原始 MemorySnapshot 收口为 MemoryHintsSnapshot 再生成 hints。
 */
/**
 * @param templateContext 可选；工作台从 templateId 启动时传入，便于与 template_saved 信号对齐。
 */
export function getMemoryHintsForTask(
  snapshot: MemorySnapshot,
  analysis: TaskAnalysisResult,
  templateContext?: MemoryHintsTemplateContext | null
): MemoryHints {
  const structured = buildMemorySnapshotForTaskHints(snapshot);
  return getMemoryHintsFromSnapshot(structured, analysis, templateContext ?? null, snapshot);
}

/**
 * D-7-4S：本地洞察用结构化快照。仅 `buildMemorySnapshotForTaskHints(loadMemorySnapshot())` 封装，
 * 不在页面层遍历聚合 behaviorLog。
 */
export function getMemoryInsightsSnapshot(): MemoryHintsSnapshot {
  return buildMemorySnapshotForTaskHints(loadMemorySnapshot());
}

/**
 * D-7-4T：最近行为日志行的记忆信号领域视图（mapper 收口，不在调用方手写聚合）。
 */
export function getRecentMemorySignalDomains(limit = 24): MemorySignalDomainModel[] {
  const snap = loadMemorySnapshot();
  const n = Math.min(Math.max(limit, 1), 100);
  return snap.behaviorLog
    .slice(-n)
    .reverse()
    .map((b) => userBehaviorMemoryToSignalDomain(b));
}
