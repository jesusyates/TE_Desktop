/**
 * P1：Memory 读取主路径 — Shared Core `GET /v1/memory`（`{ items: [...] }`）。
 * 写入仍经 `POST /v1/memory/entries`（memoryWriteService / api）。
 * 详情无独立 GET 时由列表项派生；删除无正式接口时不走旧网关。
 */
import { apiClient } from "./apiClient";
import { normalizeV1ResponseBody } from "./v1Envelope";

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

/** @deprecated 旧 /memory-records 形态；仅兼容少量遗留调用，数据源自 `/v1/memory`映射 */
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

function assertOk(status: number, body: unknown): void {
  if (status < 200 || status >= 300) {
    const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const msg = typeof o.message === "string" ? o.message : `HTTP ${status}`;
    throw new Error(msg || "请求失败");
  }
}

function extractV1Items(raw: unknown): Record<string, unknown>[] {
  const inner = normalizeV1ResponseBody(raw);
  if (!inner || typeof inner !== "object") return [];
  const items = (inner as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.filter(
    (x): x is Record<string, unknown> => x != null && typeof x === "object" && !Array.isArray(x)
  );
}

/** Shared Core 列表项 → MemoryListItemVm（资产记忆：成功 pattern 等） */
function v1MemoryRowToListVm(row: Record<string, unknown>): MemoryListItemVm {
  const memoryId = String(row.memoryId ?? row.id ?? "").trim();
  const memoryType = String(row.type ?? "pattern").trim() || "pattern";
  const summary = String(row.summary ?? "").trim();
  const createdAt = String(row.createdAt ?? row.created_at ?? "").trim();
  return {
    memoryId,
    memoryType,
    key: memoryType,
    valuePreview: summary.slice(0, 2000),
    source: "task",
    sourceId: memoryId || "—",
    createdAt,
    updatedAt: createdAt,
    isActive: true
  };
}

async function fetchV1MemoryRows(): Promise<Record<string, unknown>[]> {
  const { data: raw, status } = await apiClient.get<unknown>("/v1/memory", {
    validateStatus: () => true
  });
  assertOk(status, raw);
  return extractV1Items(raw);
}

export type FetchMemoryListParams = {
  page?: number;
  pageSize?: number;
  memoryType?: string;
  isActive?: string;
};

/** GET /v1/memory — 客户端分页与类型过滤 */
export async function fetchMemoryList(
  params: FetchMemoryListParams = {}
): Promise<{ list: MemoryListItemVm[]; total: number }> {
  const rows = await fetchV1MemoryRows();
  let list = rows.map(v1MemoryRowToListVm);

  const mt = params.memoryType?.trim();
  if (mt) {
    list = list.filter((r) => r.memoryType === mt);
  }

  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize ?? 20)));
  const total = list.length;
  const start = (page - 1) * pageSize;
  const pageRows = list.slice(start, start + pageSize);
  return { list: pageRows, total };
}

/**
 * 无 GET /v1/memory/:id：由当前 `/v1/memory` 全量列表匹配 `memoryId`。
 * `value` 为列表可得字段的 JSON 摘要（非旧网关全文）。
 */
export async function fetchMemoryById(memoryId: string): Promise<MemoryDetailVm> {
  const id = memoryId.trim();
  if (!id) throw new Error("memory_id_required");
  const rows = await fetchV1MemoryRows();
  const row = rows.find((r) => String(r.memoryId ?? r.id ?? "").trim() === id);
  if (!row) throw new Error("memory_not_found");
  const base = v1MemoryRowToListVm(row);
  const value = JSON.stringify(
    {
      type: base.memoryType,
      summary: String(row.summary ?? ""),
      market: row.market,
      locale: row.locale,
      product: row.product
    },
    null,
    2
  );
  return { ...base, value };
}

function v1RowToLegacyRecord(row: Record<string, unknown>, index: number): CoreMemoryRecordItem {
  const createdAt = String(row.createdAt ?? row.created_at ?? "").trim();
  const memoryId = String(row.memoryId ?? row.id ?? "").trim();
  const id = memoryId || `mem:${index}:${createdAt}`;
  return {
    id,
    prompt: String(row.summary ?? "").slice(0, 500),
    requestedMode: "",
    resolvedMode: "",
    intent: String(row.type ?? ""),
    planId: null,
    createdAt,
    capabilityIds: []
  };
}

/** @deprecated 同源 `GET /v1/memory`，非旧 snapshot 语义 */
export async function listCoreMemoryRecords(limit = 50): Promise<CoreMemoryRecordItem[]> {
  const rows = await fetchV1MemoryRows();
  const lim = Math.min(200, Math.max(1, limit));
  return rows.slice(0, lim).map((r, i) => v1RowToLegacyRecord(r, i));
}

/** @deprecated 同源 `GET /v1/memory` */
export async function getCoreMemorySnapshot(limit = 100): Promise<CoreMemoryRecordItem[]> {
  return listCoreMemoryRecords(limit);
}
