/**
 * History 与 Task 同源：仅 `GET|POST|DELETE /v1/history`，数据来自 task store。
 */
import { apiClient } from "./apiClient";
import { isV1SuccessEnvelope } from "./v1Envelope";

export type ExecutionHistoryStatus = "success" | "error" | "stopped";
export type ExecutionHistoryMode = "ai" | "local" | "fallback";

export type HistoryListItemDto = {
  historyId: string;
  prompt: string;
  createdAt: string;
  status: ExecutionHistoryStatus;
  mode: ExecutionHistoryMode;
  preview: string;
  executionTaskId: string;
};

export type HistoryListPageData = {
  items: HistoryListItemDto[];
  total: number;
  page: number;
  pageSize: number;
};

export type HistoryRecordDto = HistoryListItemDto;

function coerceHistoryRow(row: unknown): HistoryListItemDto | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const historyId = String(o.historyId ?? o.id ?? "").trim();
  if (!historyId) return null;
  return {
    historyId,
    prompt: String(o.prompt ?? "").trim(),
    createdAt: String(o.createdAt ?? o.created_at ?? "").trim(),
    status: (o.status as ExecutionHistoryStatus) || "success",
    mode: (o.mode as ExecutionHistoryMode) || "ai",
    preview: String(o.preview ?? "").trim(),
    executionTaskId: String(o.executionTaskId ?? o.execution_task_id ?? historyId).trim()
  };
}

export async function fetchHistoryListPage(
  page: number,
  pageSize: number,
  status?: ExecutionHistoryStatus | null
): Promise<HistoryListPageData> {
  const res = await apiClient.get<unknown>("/v1/history", {
    params: {
      page,
      pageSize,
      ...(status ? { status } : {})
    }
  });
  const raw = res.data;
  if (!isV1SuccessEnvelope(raw)) {
    throw new Error("history_list_invalid");
  }
  const inner = raw.data as Record<string, unknown>;
  const itemsRaw = Array.isArray(inner.items) ? inner.items : [];
  const items: HistoryListItemDto[] = [];
  for (const row of itemsRaw) {
    const c = coerceHistoryRow(row);
    if (c) items.push(c);
  }
  const pag =
    raw.meta && typeof raw.meta === "object" && raw.meta !== null && "pagination" in raw.meta
      ? (raw.meta as { pagination?: { total?: number; page?: number; pageSize?: number; totalPages?: number } })
          .pagination
      : undefined;
  const total = typeof pag?.total === "number" ? pag.total : items.length;
  const pageOut = typeof pag?.page === "number" ? pag.page : Number(inner.page) || page;
  const pageSizeOut = typeof pag?.pageSize === "number" ? pag.pageSize : Number(inner.pageSize) || pageSize;
  return { items, total, page: pageOut, pageSize: pageSizeOut };
}

export async function fetchHistoryRecord(historyId: string): Promise<HistoryRecordDto | null> {
  const id = historyId.trim();
  if (!id) return null;
  const res = await apiClient.get<unknown>(`/v1/history/${encodeURIComponent(id)}`);
  const raw = res.data;
  if (!isV1SuccessEnvelope(raw)) return null;
  const inner = raw.data as { item?: unknown };
  return inner?.item ? coerceHistoryRow(inner.item) : null;
}

export async function deleteHistoryRecord(historyId: string): Promise<void> {
  await apiClient.delete(`/v1/history/${encodeURIComponent(historyId)}`);
}

export type AppendHistoryPayload = {
  prompt: string;
  preview?: string;
  status: ExecutionHistoryStatus;
  mode: ExecutionHistoryMode;
  taskId?: string;
};

export async function appendExecutionHistory(payload: AppendHistoryPayload): Promise<void> {
  await apiClient.post("/v1/history", payload);
}
