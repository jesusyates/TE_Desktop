/**
 * D-3：AICS Core Memory 正式查询（/memory/list、/memory/:id）。
 * 旧 /memory-records 仍保留作兼容，新 UI 须以本模块 ViewModel 为契约。
 */
import { aiGatewayClient } from "./apiClient";

export type MemoryReadSource = "core" | "local";

/** D-3：列表最小可展示形态 */
export type MemoryListItemVm = {
  memoryId: string;
  memoryType: string;
  key: string;
  valuePreview: string;
  source: string;
  sourceId: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
};

export type MemoryDetailVm = MemoryListItemVm & {
  value: string;
};

/** @deprecated 仅旧 /memory-records 解析；新代码勿作正式模型依赖 */
export type CoreMemoryRecordItem = {
  id: string;
  prompt: string;
  requestedMode: string;
  resolvedMode: string;
  intent: string;
  planId: string | null;
  createdAt: string;
  capabilityIds: string[];
  success?: boolean;
  hash?: string;
};

function parseListItem(it: Record<string, unknown>): MemoryListItemVm {
  return {
    memoryId: typeof it.memoryId === "string" ? it.memoryId : "",
    memoryType: typeof it.memoryType === "string" ? it.memoryType : "",
    key: typeof it.key === "string" ? it.key : "",
    valuePreview: typeof it.valuePreview === "string" ? it.valuePreview : "",
    source: typeof it.source === "string" ? it.source : "",
    sourceId: typeof it.sourceId === "string" ? it.sourceId : "",
    createdAt: typeof it.createdAt === "string" ? it.createdAt : "",
    updatedAt: typeof it.updatedAt === "string" ? it.updatedAt : "",
    isActive: it.isActive !== false
  };
}

function parseMemoryListPayload(body: unknown): { list: MemoryListItemVm[]; total: number } {
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (obj.success !== true || obj.data == null || typeof obj.data !== "object") {
    throw new Error("invalid_memory_list");
  }
  const d = obj.data as Record<string, unknown>;
  const raw = d.list;
  const list: MemoryListItemVm[] = [];
  if (Array.isArray(raw)) {
    for (const it of raw) {
      if (it && typeof it === "object") list.push(parseListItem(it as Record<string, unknown>));
    }
  }
  const total = typeof d.total === "number" && Number.isFinite(d.total) ? d.total : list.length;
  return { list, total };
}

function parseMemoryDetailPayload(body: unknown): MemoryDetailVm {
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (obj.success !== true || obj.data == null || typeof obj.data !== "object") {
    throw new Error("invalid_memory_detail");
  }
  const r = obj.data as Record<string, unknown>;
  const base = parseListItem(r);
  return {
    ...base,
    value: typeof r.value === "string" ? r.value : ""
  };
}

function assertOk(status: number, body: unknown): void {
  if (status < 200 || status >= 300) {
    const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const msg = typeof o.message === "string" ? o.message : `HTTP ${status}`;
    throw new Error(msg || "请求失败");
  }
}

export type FetchMemoryListParams = {
  page?: number;
  pageSize?: number;
  memoryType?: string;
  isActive?: string;
};

/** GET /memory/list */
export async function fetchMemoryList(
  params: FetchMemoryListParams = {}
): Promise<{ list: MemoryListItemVm[]; total: number }> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize ?? 20)));
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("pageSize", String(pageSize));
  if (params.memoryType?.trim()) q.set("memoryType", params.memoryType.trim());
  if (params.isActive != null && String(params.isActive).trim() !== "") {
    q.set("isActive", String(params.isActive).trim());
  }
  const { data, status } = await aiGatewayClient.get<unknown>(`/memory/list?${q.toString()}`, {
    validateStatus: () => true
  });
  assertOk(status, data);
  return parseMemoryListPayload(data);
}

/** GET /memory/:id */
export async function fetchMemoryById(memoryId: string): Promise<MemoryDetailVm> {
  const id = memoryId.trim();
  if (!id) throw new Error("memory_id_required");
  const { data, status } = await aiGatewayClient.get<unknown>(
    `/memory/${encodeURIComponent(id)}`,
    { validateStatus: () => true }
  );
  assertOk(status, data);
  return parseMemoryDetailPayload(data);
}

/** DELETE /memory/:id — H-2 用户删除归档行 */
export async function deleteMemoryById(memoryId: string): Promise<void> {
  const id = memoryId.trim();
  if (!id) throw new Error("memory_id_required");
  const { data, status } = await aiGatewayClient.delete<unknown>(
    `/memory/${encodeURIComponent(id)}`,
    { validateStatus: () => true }
  );
  assertOk(status, data);
}

function parseLegacyItems(body: unknown): CoreMemoryRecordItem[] {
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (obj.success !== true || !Array.isArray(obj.items)) return [];
  const out: CoreMemoryRecordItem[] = [];
  for (const it of obj.items) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const createdAt = typeof r.createdAt === "string" ? r.createdAt : "";
    const id = typeof r.id === "string" && r.id.trim() ? r.id : `mem:${createdAt}`;
    const hash =
      typeof r.hash === "string" && r.hash.trim() ? r.hash.trim() : undefined;
    out.push({
      id,
      prompt: typeof r.prompt === "string" ? r.prompt : "",
      requestedMode: typeof r.requestedMode === "string" ? r.requestedMode : "",
      resolvedMode: typeof r.resolvedMode === "string" ? r.resolvedMode : "",
      intent: typeof r.intent === "string" ? r.intent : "",
      planId: r.planId != null && String(r.planId).trim() !== "" ? String(r.planId) : null,
      createdAt,
      capabilityIds: Array.isArray(r.capabilityIds) ? r.capabilityIds.map(String) : [],
      success: typeof r.success === "boolean" ? r.success : undefined,
      ...(hash ? { hash } : {})
    });
  }
  return out;
}

/** @deprecated 使用 fetchMemoryList */
export async function listCoreMemoryRecords(limit = 50): Promise<CoreMemoryRecordItem[]> {
  const lim = Math.min(200, Math.max(1, limit));
  const { data, status } = await aiGatewayClient.get<unknown>(`/memory-records?limit=${lim}`, {
    validateStatus: () => true
  });
  assertOk(status, data);
  return parseLegacyItems(data);
}

/** @deprecated 使用 fetchMemoryList */
export async function getCoreMemorySnapshot(limit = 100): Promise<CoreMemoryRecordItem[]> {
  const lim = Math.min(200, Math.max(1, limit));
  const { data, status } = await aiGatewayClient.get<unknown>(
    `/memory-records/snapshot?limit=${lim}`,
    { validateStatus: () => true }
  );
  assertOk(status, data);
  return parseLegacyItems(data);
}
