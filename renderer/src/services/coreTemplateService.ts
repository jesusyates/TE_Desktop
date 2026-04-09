/**
 * E-1 / E-2 / E-3：AICS Core 模板查询与保存（GET /templates/list、GET /templates/:id、POST /templates/save）。须经 AI 网关访问 aics-core。
 */
import { aiGatewayClient } from "./apiClient";
import type { FormalTemplateRecord } from "../domain/models/formalTemplateRecord";
import { normalizeFormalTemplateRow } from "../domain/mappers/formalTemplateMapper";
import type { TaskMode } from "../types/taskMode";
import type { TemplateVariable } from "../modules/templates/types/template";

export type FetchTemplateListParams = {
  page?: number;
  pageSize?: number;
  isSystem?: boolean;
  isFavorite?: boolean;
  workflowType?: string;
};

function assertOk(status: number, body: unknown): void {
  if (status < 200 || status >= 300) {
    const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const msg = typeof o.message === "string" ? o.message : `HTTP ${status}`;
    throw new Error(msg || "请求失败");
  }
}

function parseListPayload(body: unknown): { list: FormalTemplateRecord[]; total: number } {
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (obj.success !== true || obj.data == null || typeof obj.data !== "object") {
    throw new Error("invalid_templates_list");
  }
  const d = obj.data as Record<string, unknown>;
  const raw = d.list;
  const list: FormalTemplateRecord[] = [];
  if (Array.isArray(raw)) {
    for (const it of raw) {
      const row = normalizeFormalTemplateRow(it);
      if (row) list.push(row);
    }
  }
  const total = typeof d.total === "number" && Number.isFinite(d.total) ? d.total : list.length;
  return { list, total };
}

/** GET /templates/list */
export async function fetchTemplateList(
  params: FetchTemplateListParams = {}
): Promise<{ list: FormalTemplateRecord[]; total: number }> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize ?? 20)));
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("pageSize", String(pageSize));
  if (params.isSystem === true) q.set("isSystem", "true");
  if (params.isSystem === false) q.set("isSystem", "false");
  if (params.isFavorite === true) q.set("isFavorite", "true");
  if (params.isFavorite === false) q.set("isFavorite", "false");
  if (params.workflowType?.trim()) q.set("workflowType", params.workflowType.trim());

  const { data, status } = await aiGatewayClient.get<unknown>(`/templates/list?${q.toString()}`, {
    validateStatus: () => true
  });
  assertOk(status, data);
  return parseListPayload(data);
}

/** E-2：POST /templates/save 请求体（禁止包含 userId） */
export type SaveTemplateToCorePayload = {
  templateType: string;
  title: string;
  description: string;
  product: "aics";
  market: string;
  locale: string;
  workflowType: string;
  version: string;
  audience: string;
  sourceTaskId: string;
  sourceResultId: string;
  content: Record<string, unknown>;
};

/** POST /templates/save */
export async function saveTemplateToCore(
  payload: SaveTemplateToCorePayload
): Promise<{ templateId: string }> {
  const { data, status } = await aiGatewayClient.post<unknown>("/templates/save", payload, {
    validateStatus: () => true
  });
  assertOk(status, data);
  const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (obj.success !== true || obj.data == null || typeof obj.data !== "object") {
    const msg = typeof obj.message === "string" ? obj.message : "invalid_templates_save";
    throw new Error(msg);
  }
  const d = obj.data as Record<string, unknown>;
  const templateId = typeof d.templateId === "string" ? d.templateId.trim() : "";
  if (!templateId) throw new Error("invalid_templates_save");
  return { templateId };
}

/** E-3：GET /templates/:id 完整行（含 content） */
export type TemplateCoreDetailRow = Record<string, unknown> & {
  templateId: string;
  title: string;
  description?: string;
  workflowType?: string;
  product?: string;
  market?: string;
  locale?: string;
  version?: string;
  audience?: string;
  sourceTaskId?: string;
  sourceResultId?: string;
  createdAt?: string;
  updatedAt?: string;
  isSystem?: boolean;
  content: Record<string, unknown>;
};

/** 详情页展示用：优先顶层字段，其次 content 内同名（服务端演进兼容） */
export function readTemplateDetailTopFields(row: TemplateCoreDetailRow): {
  product: string;
  market: string;
  locale: string;
  workflowType: string;
  version: string;
  audience: string;
} {
  const co = row.content && typeof row.content === "object" ? (row.content as Record<string, unknown>) : {};
  const formal =
    co.formalMeta && typeof co.formalMeta === "object" && !Array.isArray(co.formalMeta)
      ? (co.formalMeta as Record<string, unknown>)
      : null;
  const pick = (k: string, fallback: string): string => {
    const top = row[k as keyof TemplateCoreDetailRow];
    if (typeof top === "string" && top.trim()) return top.trim();
    const inner = co[k];
    if (typeof inner === "string" && inner.trim()) return inner.trim();
    if (formal) {
      const fm = formal[k];
      if (typeof fm === "string" && fm.trim()) return fm.trim();
    }
    return fallback;
  };
  return {
    product: pick("product", "aics"),
    market: pick("market", "global"),
    locale: pick("locale", "und"),
    workflowType: pick("workflowType", ""),
    version: pick("version", "1"),
    audience: pick("audience", "general")
  };
}

/** E-3：自 Core content 规范化，供执行上下文与占位生成（单一真相） */
export type TemplateCoreContentNormalized = {
  sourcePrompt: string;
  requestedMode: TaskMode;
  stepsSnapshot: unknown[];
  resultSnapshot?: unknown;
  sourceResultKind?: string;
  variables?: TemplateVariable[];
};

function mapWorkflowToTaskMode(w?: string): TaskMode {
  const wk = (w ?? "").toLowerCase().trim();
  if (wk === "content") return "content";
  if (wk === "computer" || wk === "automation") return "computer";
  return "auto";
}

function parseVariablesFromContent(raw: unknown): TemplateVariable[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: TemplateVariable[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const key = String(o.key ?? o.id ?? "").trim();
    const label = String(o.label ?? key).trim();
    const id = String(o.id ?? key).trim() || key;
    if (!key && !label) continue;
    const t = o.type === "textarea" || o.type === "number" || o.type === "select" ? o.type : "text";
    const row: TemplateVariable = {
      id: id || key || "var",
      key: key || id,
      label: label || key,
      type: t,
      required: o.required === true,
      defaultValue: typeof o.defaultValue === "string" ? o.defaultValue : undefined,
      placeholder: typeof o.placeholder === "string" ? o.placeholder : undefined,
      options: Array.isArray(o.options) ? o.options.map((x) => String(x)) : undefined
    };
    out.push(row);
  }
  return out.length ? out : undefined;
}

/** 将 Core 详情中的 content 转为执行链使用的稳定结构 */
export function normalizeTemplateCoreContent(
  content: Record<string, unknown> | null | undefined,
  workflowTypeFallback?: string
): TemplateCoreContentNormalized {
  const co = content && typeof content === "object" ? content : {};
  const sp = typeof co.sourcePrompt === "string" ? co.sourcePrompt : "";
  const rmRaw = co.requestedMode;
  let requestedMode: TaskMode =
    rmRaw === "content" || rmRaw === "computer" || rmRaw === "auto"
      ? rmRaw
      : mapWorkflowToTaskMode(workflowTypeFallback);
  if (requestedMode === "auto" && workflowTypeFallback) {
    requestedMode = mapWorkflowToTaskMode(workflowTypeFallback);
  }
  const steps = Array.isArray(co.stepsSnapshot) ? co.stepsSnapshot : [];
  const srcKind = typeof co.sourceResultKind === "string" ? co.sourceResultKind : undefined;
  const resultSnapshot = co.resultSnapshot;
  const variables = parseVariablesFromContent(co.variables);
  return {
    sourcePrompt: sp,
    requestedMode,
    stepsSnapshot: steps,
    ...(resultSnapshot !== undefined ? { resultSnapshot } : {}),
    ...(srcKind ? { sourceResultKind: srcKind } : {}),
    ...(variables?.length ? { variables } : {})
  };
}

function parseDetailPayload(body: unknown): TemplateCoreDetailRow {
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (obj.success !== true || obj.data == null || typeof obj.data !== "object") {
    const msg = typeof obj.message === "string" ? obj.message : "invalid_template_detail";
    throw new Error(msg);
  }
  const d = obj.data as Record<string, unknown>;
  const templateId = typeof d.templateId === "string" ? d.templateId.trim() : "";
  const title = typeof d.title === "string" ? d.title : "";
  const content = d.content;
  if (!templateId || !title || content == null || typeof content !== "object") {
    throw new Error("invalid_template_detail");
  }
  return d as TemplateCoreDetailRow;
}

/** GET /templates/:id */
export async function fetchTemplateById(templateId: string): Promise<TemplateCoreDetailRow> {
  const tid = templateId.trim();
  if (!tid) throw new Error("invalid_template_id");
  const enc = encodeURIComponent(tid);
  const { data, status } = await aiGatewayClient.get<unknown>(`/templates/${enc}`, {
    validateStatus: () => true
  });
  assertOk(status, data);
  return parseDetailPayload(data);
}

/** DELETE /templates/:id — 仅用户自建模板 */
export async function deleteTemplateById(templateId: string): Promise<void> {
  const tid = templateId.trim();
  if (!tid) throw new Error("invalid_template_id");
  const enc = encodeURIComponent(tid);
  const { data, status } = await aiGatewayClient.delete<unknown>(`/templates/${enc}`, {
    validateStatus: () => true
  });
  assertOk(status, data);
}
