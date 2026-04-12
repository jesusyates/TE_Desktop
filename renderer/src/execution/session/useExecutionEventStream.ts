import { useEffect, useMemo, useState } from "react";
import { peekExecutionDetailCache } from "../../services/executionDetailLocalCache";
import { fetchTaskSnapshot, type TaskSnapshotResponse } from "../../services/tasks.api";
import { mapBackendStatusToExecutionStatus } from "./taskExecutionMap";
import { shouldPollTaskStatus } from "./execution";

const BASE_INTERVAL_MS = 2000;
const MAX_BACKOFF_MS = 10000;

export type ExecutionEventStreamSnapshot = {
  /** 后端 task.status */
  rawStatus: string;
  /** 原始 logs 数组 */
  logs: unknown[];
  /** 原始 steps 数组 */
  steps: unknown[];
  /** 原始 task.result */
  result: unknown;
  /** 原始 lastErrorSummary */
  error: string | null;
};

const EMPTY: ExecutionEventStreamSnapshot = {
  rawStatus: "",
  logs: [],
  steps: [],
  result: null,
  error: null
};

function normalizeSnapshot(data: TaskSnapshotResponse): ExecutionEventStreamSnapshot {
  const task = data.task;
  const lastErr = task.lastErrorSummary;
  return {
    rawStatus: task.status ?? "",
    logs: Array.isArray(data.logs) ? data.logs : [],
    steps: Array.isArray(data.steps) ? data.steps : [],
    result: task.result ?? null,
    error: lastErr == null || lastErr === "" ? null : String(lastErr)
  };
}

/** D-7-4B：本地全文缓存 → 事件流快照（steps/status 待轮询补齐） */
function snapshotFromLocalCache(taskId: string): ExecutionEventStreamSnapshot | null {
  const peek = peekExecutionDetailCache(taskId);
  if (!peek) return null;
  return {
    rawStatus: "",
    logs: peek.logs,
    steps: [],
    result: peek.result,
    error: null
  };
}

/**
 * D-2-4B：只读轮询 GET /v1/tasks/:taskId（经 fetchTaskSnapshot）。
 * 不接管 UI；成功时 console.log，失败 console.warn + 指数退避。
 */
export function useExecutionEventStream(taskId: string): ExecutionEventStreamSnapshot {
  const [snap, setSnap] = useState<ExecutionEventStreamSnapshot>(() => {
    const tid = taskId?.trim() ?? "";
    return tid ? snapshotFromLocalCache(tid) ?? EMPTY : EMPTY;
  });

  const stableEmpty = useMemo(() => EMPTY, []);

  useEffect(() => {
    if (!taskId || !taskId.trim()) {
      setSnap(stableEmpty);
      return;
    }

    const tid = taskId.trim();
    const cached = snapshotFromLocalCache(tid);
    setSnap(cached ?? EMPTY);

    let cancelled = false;
    let backoffMs = BASE_INTERVAL_MS;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let stopReason: string | null = null;
    let stopLogged = false;

    const devPoll = (msg: string, detail?: Record<string, unknown>) => {
      if (!import.meta.env.DEV) return;
      // eslint-disable-next-line no-console -- DEV 轮询排障
      console.debug(`[execution-poll] ${msg}`, { taskId: tid, runId: null as string | null, ...detail });
    };

    const logPollingStopOnce = (reason: string, extra?: Record<string, unknown>) => {
      if (stopLogged) return;
      stopLogged = true;
      stopReason = reason;
      devPoll("polling stop", { stopReason: reason, ...extra });
    };

    devPoll("polling start", { reason: "effect_subscribed" });

    const schedule = (delay: number, fn: () => void) => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      timeoutId = setTimeout(fn, delay);
    };

    const poll = async () => {
      if (cancelled) return;
      try {
        const data = await fetchTaskSnapshot(tid);
        if (cancelled) return;
        backoffMs = BASE_INTERVAL_MS;
        const next = normalizeSnapshot(data);
        setSnap(next);
        const mapped = mapBackendStatusToExecutionStatus(next.rawStatus);
        const continuePoll = shouldPollTaskStatus(mapped, tid, null);
        devPoll("polling tick", {
          rawStatus: next.rawStatus,
          mappedStatus: mapped,
          continuePoll,
          logsCount: next.logs.length,
          stepsCount: next.steps.length,
          hasResult: next.result != null
        });
        if (!continuePoll) {
          logPollingStopOnce("terminal_status", {
            rawStatus: next.rawStatus,
            mappedStatus: mapped
          });
          return;
        }
        schedule(BASE_INTERVAL_MS, () => {
          void poll();
        });
      } catch (e) {
        if (cancelled) return;
        console.warn("[event-stream] fetch failed", { taskId: tid, error: e });
        devPoll("polling tick", { error: true, stopReason: null });
        backoffMs = Math.min(Math.max(backoffMs * 2, BASE_INTERVAL_MS), MAX_BACKOFF_MS);
        schedule(backoffMs, () => {
          void poll();
        });
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      logPollingStopOnce(stopReason ?? "unmount_or_taskid_change");
    };
  }, [taskId, stableEmpty]);

  if (!taskId || !taskId.trim()) {
    return EMPTY;
  }

  return snap;
}
