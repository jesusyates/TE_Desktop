import { apiClient } from "./apiClient";

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

export type HistoryListResponse = {
  success: true;
  data: HistoryListPageData;
};

export type HistoryRecordDto = HistoryListItemDto;

export async function fetchHistoryListPage(
  page: number,
  pageSize: number,
  status?: ExecutionHistoryStatus | null
): Promise<HistoryListPageData> {
  const res = await apiClient.get<HistoryListResponse>("/history/list", {
    params: {
      page,
      pageSize,
      ...(status ? { status } : {})
    }
  });
  const d = res.data;
  if (!d || !d.success || !d.data || !Array.isArray(d.data.items)) {
    throw new Error("history_list_invalid");
  }
  return d.data;
}

export async function fetchHistoryRecord(historyId: string): Promise<HistoryRecordDto | null> {
  const id = historyId.trim();
  if (!id) return null;
  const res = await apiClient.get<{ success: boolean; data?: HistoryRecordDto }>(`/history/${encodeURIComponent(id)}`);
  const payload = res.data;
  if (!payload || !payload.success || !payload.data) return null;
  return payload.data;
}

export async function deleteHistoryRecord(historyId: string): Promise<void> {
  await apiClient.delete(`/history/${encodeURIComponent(historyId)}`);
}

export type AppendHistoryPayload = {
  prompt: string;
  preview?: string;
  status: ExecutionHistoryStatus;
  mode: ExecutionHistoryMode;
  /** J-1+：关联 Core execution task，供历史行恢复只读详情 */
  taskId?: string;
};

/** D-1：工作台终态上报（不走 refresh）；失败静默，不打断会话。 */
export async function appendExecutionHistory(payload: AppendHistoryPayload): Promise<void> {
  await apiClient.post("/history", payload);
}
