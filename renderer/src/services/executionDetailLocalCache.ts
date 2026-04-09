/**
 * D-7-3U / D-7-3U+：Execution unifiedResult / 轮询日志本地缓存，接入裁剪、冷却、幂等写入与 Core 标记。
 * 仅 localStorage；不请求 Core；不改对外 HTTP API。
 */

import { taskResultToDomainModel } from "../domain/mappers/taskResultMapper";
import type { ResultDomainModel } from "../domain/models/resultDomainModel";
import type { TaskResult } from "../modules/result/resultTypes";
import { toTaskResult } from "../modules/result/resultAdapters";
import { isLocalRuntimeSummaryOnlyForPersistence } from "../modules/result/taskResultLocalRetention";
import type { CachedLogFullEntry, CachedResultFullEntry } from "./localCachePolicy";
import {
  applyLogFullCooldown,
  applyResultFullCooldown,
  trimLogFullCache,
  trimResultFullCache
} from "./localCachePolicy";

const RESULT_CACHE_KEY = "aics.execution.detailResults.v1";
const LOG_CACHE_KEY = "aics.execution.detailLogs.v1";

/** D-7-3U+：短时间内相同 taskId + 内容指纹不重复写入 */
const recentWriteMap = new Map<string, number>();
const WRITE_DEDUP_WINDOW_MS = 5000;

type ResultEnvelope = { rows: CachedResultFullEntry[] };
type LogEnvelope = { rows: CachedLogFullEntry[] };

function normalizeResultRow(r: CachedResultFullEntry): CachedResultFullEntry {
  return {
    ...r,
    hasCoreSync: r.hasCoreSync ?? !!r.coreRunId,
    verifiedWithCore: r.verifiedWithCore ?? false
  };
}

function normalizeLogRow(r: CachedLogFullEntry): CachedLogFullEntry {
  return {
    ...r,
    hasCoreSync: r.hasCoreSync ?? !!r.coreRunId,
    verifiedWithCore: r.verifiedWithCore ?? false
  };
}

function contentFingerprint(unified: TaskResult | null, logsJson: string): string {
  if (!unified && !logsJson) return "nohash";
  const u = unified ? JSON.stringify(unified) : "";
  let h = 5381;
  const s = `${u}\0${logsJson}`;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h, 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

function loadResultRows(): CachedResultFullEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RESULT_CACHE_KEY);
    if (!raw) return [];
    const o = JSON.parse(raw) as Partial<ResultEnvelope>;
    return Array.isArray(o.rows) ? o.rows.map((x) => normalizeResultRow(x as CachedResultFullEntry)) : [];
  } catch {
    return [];
  }
}

function saveResultRows(rows: CachedResultFullEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: ResultEnvelope = { rows };
    window.localStorage.setItem(RESULT_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

function loadLogRows(): CachedLogFullEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOG_CACHE_KEY);
    if (!raw) return [];
    const o = JSON.parse(raw) as Partial<LogEnvelope>;
    return Array.isArray(o.rows) ? o.rows.map((x) => normalizeLogRow(x as CachedLogFullEntry)) : [];
  } catch {
    return [];
  }
}

function saveLogRows(rows: CachedLogFullEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: LogEnvelope = { rows };
    window.localStorage.setItem(LOG_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

function resolveUnifiedResult(
  currentResult: TaskResult | null,
  streamResult: unknown
): TaskResult | null {
  if (currentResult) return currentResult;
  return toTaskResult(streamResult);
}

/** 本地执行：详情缓存不写全文，仅摘要级载荷 */
function unifiedResultForPersistence(raw: TaskResult | null): TaskResult | null {
  if (!raw || !isLocalRuntimeSummaryOnlyForPersistence(raw)) return raw;
  if (raw.kind !== "content") return raw;
  const shortBody = (raw.summary || raw.title || "").trim();
  return { ...raw, body: shortBody };
}

export type PersistExecutionCachesInput = {
  taskId: string;
  currentResult: TaskResult | null;
  streamResult: unknown;
  logs: unknown[];
  coreRunId?: string;
};

/**
 * 终端态写入：幂等门闩 → 截断日志 → 冷却 → 合并 → trim → lastAccessAt；无网络。
 */
export function persistExecutionCachesTerminal(input: PersistExecutionCachesInput): void {
  const taskId = input.taskId.trim();
  if (!taskId || typeof window === "undefined") return;

  const logsTrimmed = input.logs.slice(-2000);
  const unified = unifiedResultForPersistence(
    resolveUnifiedResult(input.currentResult, input.streamResult)
  );
  const logsJson = logsTrimmed.length > 0 ? JSON.stringify(logsTrimmed) : "";

  if (!unified && !logsJson) return;

  const hash = contentFingerprint(unified, logsJson);
  const cacheKey = `${taskId}:${hash || "nohash"}`;
  const now = Date.now();
  const last = recentWriteMap.get(cacheKey);
  if (last && now - last < WRITE_DEDUP_WINDOW_MS) {
    return;
  }
  recentWriteMap.set(cacheKey, now);

  const coreRunId = input.coreRunId?.trim() || undefined;
  const hasCoreSync = !!coreRunId;

  if (unified) {
    let rows = loadResultRows();
    rows = applyResultFullCooldown(rows, now);
    const fullPayload = JSON.stringify(unified);
    rows = rows.filter((r) => r.id !== taskId);
    rows.push({
      id: taskId,
      lastAccessAt: now,
      fullPayload,
      coreRunId,
      hasCoreSync,
      verifiedWithCore: false,
      hash
    });
    rows = trimResultFullCache(rows);
    saveResultRows(rows);
  }

  if (logsTrimmed.length > 0) {
    let logRows = loadLogRows();
    logRows = applyLogFullCooldown(logRows, now);
    const fullPayload = logsJson;
    logRows = logRows.filter((r) => r.taskId !== taskId);
    logRows.push({
      taskId,
      lastAccessAt: now,
      fullPayload,
      coreRunId,
      hasCoreSync,
      verifiedWithCore: false,
      hash
    });
    logRows = trimLogFullCache(logRows);
    saveLogRows(logRows);
  }
}

/** 读缓存：标记 lastViewedAt 并落盘，再冷却与 trim（不走 UI 主链时可调用） */
export function readExecutionDetailResultRows(): CachedResultFullEntry[] {
  const now = Date.now();
  let rows: CachedResultFullEntry[] = loadResultRows().map((r) => ({ ...r, lastViewedAt: now }));
  rows = applyResultFullCooldown(rows, now);
  rows = trimResultFullCache(rows);
  saveResultRows(rows);
  return rows;
}

export function readExecutionDetailLogRows(): CachedLogFullEntry[] {
  const now = Date.now();
  let rows: CachedLogFullEntry[] = loadLogRows().map((r) => ({ ...r, lastViewedAt: now }));
  rows = applyLogFullCooldown(rows, now);
  rows = trimLogFullCache(rows);
  saveLogRows(rows);
  return rows;
}

/** D-7-4B：同步窥视单 task 全文缓存，不改写 storage、不触发全表 lastViewedAt */
export type PeekExecutionDetailCache = {
  result: unknown | null;
  logs: unknown[];
  hash?: string;
  coreRunId?: string;
};

export function peekExecutionDetailCache(taskId: string): PeekExecutionDetailCache | null {
  const tid = taskId.trim();
  if (!tid || typeof window === "undefined") return null;

  const r = loadResultRows().find((row) => row.id === tid);
  const l = loadLogRows().find((row) => row.taskId === tid);
  const rPayload = r?.fullPayload?.trim();
  const lPayload = l?.fullPayload?.trim();
  if (!rPayload && !lPayload) return null;

  let result: unknown | null = null;
  if (rPayload) {
    try {
      result = JSON.parse(rPayload) as unknown;
    } catch {
      result = null;
    }
  }

  let logs: unknown[] = [];
  if (lPayload) {
    try {
      const parsed = JSON.parse(lPayload) as unknown;
      logs = Array.isArray(parsed) ? parsed : [];
    } catch {
      logs = [];
    }
  }

  if (result == null && logs.length === 0) return null;

  return {
    result,
    logs,
    hash: r?.hash ?? l?.hash,
    coreRunId: r?.coreRunId ?? l?.coreRunId
  };
}

/** D-7-4T：详情缓存中的统一结果 → ResultDomainModel（无缓存或无法解析则为 null）。 */
export function peekResultDomainModel(taskId: string): ResultDomainModel | null {
  const peek = peekExecutionDetailCache(taskId);
  if (peek?.result == null) return null;
  const tr = toTaskResult(peek.result);
  if (!tr) return null;
  return taskResultToDomainModel(taskId.trim(), tr, {
    hash: peek.hash,
    hasCoreSync: Boolean(peek.coreRunId?.trim())
  });
}

/** H-1：设置页「清除本地缓存」— 仅详情全文缓存，不影响任务列表 Core 数据 */
export function clearExecutionDetailLocalCaches(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RESULT_CACHE_KEY);
    window.localStorage.removeItem(LOG_CACHE_KEY);
  } catch {
    /* quota */
  }
  recentWriteMap.clear();
}
