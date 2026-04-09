import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteHistoryRecord,
  fetchHistoryListPage,
  type ExecutionHistoryStatus,
  type HistoryListItemDto
} from "../../../services/history.api";
import { toUserFacingErrorMessage } from "../../../services/userFacingErrorMessage";
import type { TaskHistoryListEntry } from "../types";

const PAGE_SIZE = 15;

export type TaskHistoryStatusFilter = "all" | ExecutionHistoryStatus;

function serverRowToEntry(row: HistoryListItemDto): TaskHistoryListEntry {
  const ex = (row.executionTaskId || "").trim();
  return {
    source: "server",
    id: row.historyId,
    historyId: row.historyId,
    executionTaskId: ex || undefined,
    status: row.status,
    mode: row.mode,
    prompt: row.prompt,
    preview: row.preview || "",
    createdAt: row.createdAt,
    updatedAt: row.createdAt
  };
}

/**
 * J-1：账户级正式历史 — GET /history/list 分页 + DELETE /history/:id（侧栏与 /history 共用，唯一真相源）。
 */
export function useTaskHistory(statusFilter: TaskHistoryStatusFilter = "all") {
  const [tasks, setTasks] = useState<TaskHistoryListEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasMore = useMemo(() => tasks.length < total, [tasks.length, total]);

  const serverStatus = statusFilter === "all" ? null : statusFilter;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHistoryListPage(1, PAGE_SIZE, serverStatus);
      setPage(1);
      setTasks(data.items.map(serverRowToEntry));
      setTotal(data.total);
    } catch (e) {
      if (import.meta.env.DEV) console.error("[useTaskHistory] refresh", e);
      setError(toUserFacingErrorMessage(e));
      setTasks([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [serverStatus]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const nextPage = page + 1;
      const data = await fetchHistoryListPage(nextPage, PAGE_SIZE, serverStatus);
      setPage(nextPage);
      setTasks((prev) => [...prev, ...data.items.map(serverRowToEntry)]);
      setTotal(data.total);
    } catch (e) {
      if (import.meta.env.DEV) console.error("[useTaskHistory] loadMore", e);
      setError(toUserFacingErrorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loading, loadingMore, page, serverStatus]);

  const removeHistoryEntry = useCallback(async (entry: TaskHistoryListEntry) => {
    if (entry.source !== "server" || !entry.historyId) return;
    try {
      await deleteHistoryRecord(entry.historyId);
      await refresh();
    } catch (e) {
      setError(toUserFacingErrorMessage(e));
    }
  }, [refresh]);

  useEffect(() => {
    const run = () => void refresh();
    let idleId: number | undefined;
    let timeoutId: number | undefined;
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(run, { timeout: 2500 });
    } else {
      timeoutId = window.setTimeout(run, 1);
    }
    return () => {
      if (idleId !== undefined && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [refresh]);

  return {
    tasks,
    loading,
    loadingMore,
    error,
    refresh,
    loadMore,
    hasMore,
    total,
    removeHistoryEntry
  };
}
