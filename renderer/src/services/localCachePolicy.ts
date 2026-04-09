/**
 * D-7-3S：本地缓存冷热分层策略骨架（无 DB、无重清理器）。
 * hot：热状态见 stateRestoration；warm：摘要；cold：降级后的摘要/元数据。
 */

import type { TaskHistoryListEntry, TaskHistorySource } from "../modules/history/types";
import type { UserBehaviorMemory } from "../modules/memory/memoryTypes";

export const MAX_WARM_HISTORY_SUMMARIES = 100;
export const MAX_FULL_RESULT_TEXT_CACHE = 20;
export const MAX_FULL_LOG_TEXT_CACHE = 20;
export const MAX_MEMORY_BEHAVIOR_RAW = 100;

/** 7 天未访问的全文缓存可降级为摘要 */
export const DETAIL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export const WARM_SUMMARIES_STORAGE_KEY = "aics.warmSummaries.v1";

export type WarmSummariesBundle = {
  entries: TaskHistoryListEntry[];
  lastListSource: TaskHistorySource | null;
  savedAt: string;
};

/** 全文结果热缓存条目（供后续 Execution 详情写入使用） */
export type CachedResultFullEntry = {
  id: string;
  lastAccessAt: number;
  contentHash?: string;
  /** 本地内容指纹 / 可信标记（与 contentHash 可并存） */
  hash?: string;
  /** 全文 JSON 字符串；降级后置空仅保留摘要 */
  fullPayload?: string;
  summaryLine?: string;
  coreRunId?: string;
  /** 是否与 Core run 有关联（由 coreRunId 推导） */
  hasCoreSync: boolean;
  /** 是否与 Core 校验一致（下一阶段；现为 false） */
  verifiedWithCore: boolean;
  /** 最近一次通过 read* 查看的时间 */
  lastViewedAt?: number;
};

export type CachedLogFullEntry = {
  taskId: string;
  lastAccessAt: number;
  fullPayload?: string;
  summaryLine?: string;
  coreRunId?: string;
  hasCoreSync: boolean;
  verifiedWithCore: boolean;
  hash?: string;
  lastViewedAt?: number;
};

export type ColdArchiveEntry = {
  id: string;
  cooledAt: string;
  summaryLine: string;
};

export function loadWarmSummaries(): WarmSummariesBundle {
  if (typeof window === "undefined") {
    return { entries: [], lastListSource: null, savedAt: "" };
  }
  try {
    const raw = window.localStorage.getItem(WARM_SUMMARIES_STORAGE_KEY);
    if (!raw) return { entries: [], lastListSource: null, savedAt: "" };
    const o = JSON.parse(raw) as Partial<WarmSummariesBundle>;
    if (!o || typeof o !== "object") return { entries: [], lastListSource: null, savedAt: "" };
    const entries = Array.isArray(o.entries) ? (o.entries as TaskHistoryListEntry[]) : [];
    const src =
      o.lastListSource === "core" || o.lastListSource === "local" ? o.lastListSource : null;
    return {
      entries: trimWarmHistorySummaries(entries),
      lastListSource: src,
      savedAt: typeof o.savedAt === "string" ? o.savedAt : ""
    };
  } catch {
    return { entries: [], lastListSource: null, savedAt: "" };
  }
}

export function persistWarmSummaries(bundle: WarmSummariesBundle): void {
  if (typeof window === "undefined") return;
  try {
    const payload: WarmSummariesBundle = {
      entries: trimWarmHistorySummaries(bundle.entries),
      lastListSource: bundle.lastListSource,
      savedAt: new Date().toISOString()
    };
    window.localStorage.setItem(WARM_SUMMARIES_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

/** D-7-5U：合并/加载前剔除用户已「本地删除」的任务 id，避免 merge 从旧 warm 层带回 */
export function stripLocallyDeletedWarmEntries(
  entries: TaskHistoryListEntry[],
  localDeletedIds: ReadonlySet<string>
): TaskHistoryListEntry[] {
  if (localDeletedIds.size === 0) return entries;
  return entries.filter((e) => !(e.source === "local" && localDeletedIds.has(e.id)));
}

/** D-7-5U：从 warm 摘要移除单条本地任务（不请求后端） */
export function removeLocalTaskHistoryEntryFromWarmStorage(taskId: string): void {
  const tid = taskId.trim();
  if (!tid) return;
  const prev = loadWarmSummaries();
  const entries = prev.entries.filter((e) => !(e.source === "local" && e.id === tid));
  persistWarmSummaries({
    entries: trimWarmHistorySummaries(entries),
    lastListSource: prev.lastListSource,
    savedAt: new Date().toISOString()
  });
}

/** 按 id 去重保留最新，截断至上限 */
export function trimWarmHistorySummaries(entries: TaskHistoryListEntry[]): TaskHistoryListEntry[] {
  const byId = new Map<string, TaskHistoryListEntry>();
  for (const e of entries) {
    if (!e?.id) continue;
    const prev = byId.get(e.id);
    const t = new Date(e.updatedAt || e.createdAt || 0).getTime();
    if (!prev) byId.set(e.id, e);
    else {
      const pt = new Date(prev.updatedAt || prev.createdAt || 0).getTime();
      if (t >= pt) byId.set(e.id, e);
    }
  }
  const sorted = [...byId.values()].sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt || 0).getTime() -
      new Date(a.updatedAt || a.createdAt || 0).getTime()
  );
  return sorted.slice(0, MAX_WARM_HISTORY_SUMMARIES);
}

export function mergeWarmHistoryFromNetwork(
  previous: TaskHistoryListEntry[],
  incoming: TaskHistoryListEntry[]
): TaskHistoryListEntry[] {
  return trimWarmHistorySummaries([...incoming, ...previous]);
}

export function shouldCooldownDetail(lastAccessAt: number, now = Date.now()): boolean {
  return now - lastAccessAt >= DETAIL_COOLDOWN_MS;
}

/** 是否满足降级：写入距今足够久，且近期未被 read* 打开过 */
export function shouldDegradeCachedDetail(
  lastAccessAt: number,
  lastViewedAt: number | undefined,
  now: number
): boolean {
  if (now - lastAccessAt <= DETAIL_COOLDOWN_MS) return false;
  if (lastViewedAt != null && now - lastViewedAt <= DETAIL_COOLDOWN_MS) return false;
  return true;
}

/** Core 与本地 hash 一致时，可丢掉本地全文仅保留摘要位 */
export function canEvictLocalFullWhenCoreHashMatches(
  localHash: string | undefined,
  coreHash: string | undefined
): boolean {
  const a = localHash?.trim();
  const b = coreHash?.trim();
  if (!a || !b) return false;
  return a === b;
}

/** 将超过冷却期的全文降级为摘要行（不删任务 id） */
export function applyResultFullCooldown(
  rows: CachedResultFullEntry[],
  now = Date.now()
): CachedResultFullEntry[] {
  return rows.map((r) => {
    if (!r.fullPayload) return r;
    if (!shouldDegradeCachedDetail(r.lastAccessAt, r.lastViewedAt, now)) return r;
    const summary =
      r.summaryLine ??
      (r.fullPayload.length > 160 ? `${r.fullPayload.slice(0, 157)}…` : r.fullPayload);
    return {
      ...r,
      fullPayload: undefined,
      summaryLine: summary,
      lastAccessAt: now
    };
  });
}

/** Step / 执行日志全文：与 result 相同冷却规则 */
export function applyLogFullCooldown(
  rows: CachedLogFullEntry[],
  now = Date.now()
): CachedLogFullEntry[] {
  return rows.map((r) => {
    if (!r.fullPayload) return r;
    if (!shouldDegradeCachedDetail(r.lastAccessAt, r.lastViewedAt, now)) return r;
    const summary =
      r.summaryLine ??
      (r.fullPayload.length > 160 ? `${r.fullPayload.slice(0, 157)}…` : r.fullPayload);
    return {
      ...r,
      fullPayload: undefined,
      summaryLine: summary,
      lastAccessAt: now
    };
  });
}

export function trimResultFullCache(rows: CachedResultFullEntry[]): CachedResultFullEntry[] {
  const sorted = [...rows].sort((a, b) => b.lastAccessAt - a.lastAccessAt);
  return sorted.slice(0, MAX_FULL_RESULT_TEXT_CACHE);
}

export function trimLogFullCache(rows: CachedLogFullEntry[]): CachedLogFullEntry[] {
  const sorted = [...rows].sort((a, b) => b.lastAccessAt - a.lastAccessAt);
  return sorted.slice(0, MAX_FULL_LOG_TEXT_CACHE);
}

export function trimBehaviorLogForPolicy(log: UserBehaviorMemory[]): UserBehaviorMemory[] {
  if (log.length <= MAX_MEMORY_BEHAVIOR_RAW) return log;
  return log.slice(-MAX_MEMORY_BEHAVIOR_RAW);
}
