/**
 * P2：模板主路径 — Shared Core `GET/POST /v1/templates`、`GET /v1/templates/:id`。
 * 内置系统模板（sys-*）仅前端编排，详情走本地合成；列表「书库」页与旧网关语义对齐。
 */
import { apiClient } from "./apiClient";
import { normalizeV1ResponseBody } from "./v1Envelope";
import type { FormalTemplateRecord } from "../domain/models/formalTemplateRecord";
import type { TaskMode } from "../types/taskMode";
import type { TemplateVariable } from "../modules/templates/types/template";

export type FetchTemplateListParams = {
  page?: number;
  pageSize?: number;
  isSystem?: boolean;
  isFavorite?: boolean;
  workflowType?: string;
};

/** 与 templateService 内置条目共 id，供书库 / 最近 / workbench sys-* 解析 */
const BUILTIN_SYSTEM_FORMAL_TEMPLATES: FormalTemplateRecord[] = [
  {
    templateId: "sys-short-video-copy",
    userId: "",
    templateType: "workflow",
    title: "短视频文案骨架",
    description: "按主题生成钩子、结构、正文要点与发布建议",
    product: "aics",
    market: "global",
    locale: "zh-CN",
    workflowType: "content",
    version: "1",
    audience: "general",
    isSystem: true,
    isFavorite: false,
    createdAt: "2026-01-15T00:00:00.000Z",
    updatedAt: "2026-01-15T00:00:00.000Z"
  },
  {
    templateId: "sys-product-bullet",
    userId: "",
    templateType: "workflow",
    title: "产品卖点清单",
    description: "从一句话产品信息扩展卖点条列",
    product: "aics",
    market: "global",
    locale: "zh-CN",
    workflowType: "content",
    version: "1",
    audience: "general",
    isSystem: true,
    isFavorite: false,
    createdAt: "2026-01-14T00:00:00.000Z",
    updatedAt: "2026-01-14T00:00:00.000Z"
  },
  {
    templateId: "sys-computer-organize",
    userId: "",
    templateType: "workflow",
    title: "桌面文件整理（Computer）",
    description: "偏向本地执行的整理类任务入口",
    product: "aics",
    market: "global",
    locale: "zh-CN",
    workflowType: "computer",
    version: "1",
    audience: "general",
    isSystem: true,
    isFavorite: false,
    createdAt: "2026-01-13T00:00:00.000Z",
    updatedAt: "2026-01-13T00:00:00.000Z"
  }
];

const BUILTIN_DETAIL_MAP: Record<
  string,
  { title: string; description: string; sourcePrompt: string; workflowType: string; updatedAt: string }
> = {
  "sys-short-video-copy": {
    title: "短视频文案骨架",
    description: "按主题生成钩子、结构、正文要点与发布建议",
    sourcePrompt:
      "主题：【在此填写】\n请生成一条短视频文案：包含 Hook、内容结构大纲、正文要点、标签与发布建议。",
    workflowType: "content",
    updatedAt: "2026-01-15T00:00:00.000Z"
  },
  "sys-product-bullet": {
    title: "产品卖点清单",
    description: "从一句话产品信息扩展卖点条列",
    sourcePrompt:
      "产品/服务：【在此填写】\n请输出：核心受众、3–5 条卖点、一句行动号召（CTA）。",
    workflowType: "content",
    updatedAt: "2026-01-14T00:00:00.000Z"
  },
  "sys-computer-organize": {
    title: "桌面文件整理（Computer）",
    description: "偏向本地执行的整理类任务入口",
    sourcePrompt: "请根据我的说明整理指定文件夹中的文件（路径与规则在正文中补充）。",
    workflowType: "computer",
    updatedAt: "2026-01-13T00:00:00.000Z"
  }
};

function assertOk(status: number, body: unknown): void {
  if (status < 200 || status >= 300) {
    const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const msg = typeof o.message === "string" ? o.message : `HTTP ${status}`;
    throw new Error(msg || "请求失败");
  }
}

function sliceFormalPage(
  list: FormalTemplateRecord[],
  page: number,
  pageSize: number
): { list: FormalTemplateRecord[]; total: number } {
  const total = list.length;
  const start = (page - 1) * pageSize;
  return { list: list.slice(start, start + pageSize), total };
}

function filterWorkflow(
  list: FormalTemplateRecord[],
  workflowType: string | undefined
): FormalTemplateRecord[] {
  const w = workflowType?.trim();
  if (!w) return list;
  return list.filter((t) => t.workflowType === w);
}

/** Core 列表单项（template-record 归一：templateId, description, promptStructure, createdAt）→ FormalTemplateRecord */
function v1SlimListItemToFormal(raw: unknown): FormalTemplateRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const templateId = String(r.templateId ?? "").trim();
  if (!templateId) return null;
  const description = String(r.description ?? "");
  const ps =
    r.promptStructure && typeof r.promptStructure === "object" && !Array.isArray(r.promptStructure)
      ? (r.promptStructure as Record<string, unknown>)
      : {};
  const formal =
    ps.formalMeta && typeof ps.formalMeta === "object" && !Array.isArray(ps.formalMeta)
      ? (ps.formalMeta as Record<string, unknown>)
      : {};
  const title =
    (typeof r.title === "string" && r.title.trim()) ||
    description.trim().split("\n")[0]?.trim() ||
    String(ps.oneLinePrompt ?? "").slice(0, 200) ||
    "untitled";
  const workflowType =
    (typeof formal.workflowType === "string" && formal.workflowType) ||
    (typeof ps.workflowType === "string" && String(ps.workflowType)) ||
    "";
  return {
    templateId,
    userId: "",
    templateType: "workflow",
    title,
    description: description && description !== title ? description : "",
    product: typeof formal.product === "string" ? formal.product : "aics",
    market: typeof formal.market === "string" ? formal.market : "global",
    locale: typeof formal.locale === "string" ? formal.locale : "und",
    workflowType,
    version: typeof formal.version === "string" ? formal.version : "1",
    audience: typeof formal.audience === "string" ? formal.audience : "general",
    isSystem: false,
    isFavorite: false,
    createdAt: String(r.createdAt ?? ""),
    updatedAt: String(r.createdAt ?? "")
  };
}

async function fetchV1TemplatesSlimRows(): Promise<Record<string, unknown>[]> {
  const { data: raw, status } = await apiClient.get<unknown>("/v1/templates", {
    validateStatus: () => true
  });
  assertOk(status, raw);
  const inner = normalizeV1ResponseBody(raw) as { templates?: unknown };
  const arr = Array.isArray(inner.templates) ? inner.templates : [];
  return arr.filter(
    (x): x is Record<string, unknown> => x != null && typeof x === "object" && !Array.isArray(x)
  );
}

/** GET /v1/templates（客户端分页 / 分栏） */
export async function fetchTemplateList(
  params: FetchTemplateListParams = {}
): Promise<{ list: FormalTemplateRecord[]; total: number }> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize ?? 20)));

  if (params.isFavorite === true) {
    return sliceFormalPage([], page, pageSize);
  }

  if (params.isSystem === true) {
    const list = filterWorkflow(BUILTIN_SYSTEM_FORMAL_TEMPLATES, params.workflowType);
    return sliceFormalPage(list, page, pageSize);
  }

  const slimRows = await fetchV1TemplatesSlimRows();
  let mapped = slimRows.map(v1SlimListItemToFormal).filter((x): x is FormalTemplateRecord => x != null);
  mapped = filterWorkflow(mapped, params.workflowType);

  if (params.isSystem === false) {
    return sliceFormalPage(mapped, page, pageSize);
  }

  const seen = new Set<string>();
  const merged: FormalTemplateRecord[] = [];
  for (const t of BUILTIN_SYSTEM_FORMAL_TEMPLATES) {
    if (seen.has(t.templateId)) continue;
    seen.add(t.templateId);
    merged.push(t);
  }
  for (const t of mapped) {
    if (seen.has(t.templateId)) continue;
    seen.add(t.templateId);
    merged.push(t);
  }
  const list = filterWorkflow(merged, params.workflowType);
  return sliceFormalPage(list, page, pageSize);
}

/** P2：POST /v1/templates（body 为可回放 JSON，与 domain store 一致） */
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

export async function saveTemplateToCore(
  payload: SaveTemplateToCorePayload
): Promise<{ templateId: string }> {
  const body: Record<string, unknown> = {
    ...payload.content,
    saveDescription: payload.description,
    sourceTaskId: payload.sourceTaskId,
    sourceResultId: payload.sourceResultId,
    saveTemplateType: payload.templateType,
    saveWorkflowType: payload.workflowType,
    saveProduct: payload.product,
    saveMarket: payload.market,
    saveLocale: payload.locale,
    saveVersion: payload.version,
    saveAudience: payload.audience
  };
  const { data: raw, status } = await apiClient.post<unknown>(
    "/v1/templates",
    { title: payload.title.trim(), body },
    { validateStatus: () => true }
  );
  assertOk(status, raw);
  const inner = normalizeV1ResponseBody(raw) as { item?: Record<string, unknown> };
  const item = inner.item;
  const id = item && typeof item.id === "string" ? item.id.trim() : "";
  if (!id) throw new Error("invalid_templates_save");
  return { templateId: id };
}

/** E-3：详情 VM（content 与旧网关对齐为可执行 JSON） */
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

function builtinTemplateDetail(templateId: string): TemplateCoreDetailRow | null {
  const b = BUILTIN_DETAIL_MAP[templateId];
  if (!b) return null;
  const wf = b.workflowType;
  const mode: TaskMode = wf === "computer" ? "computer" : "content";
  return {
    templateId,
    title: b.title,
    description: b.description,
    workflowType: wf,
    product: "aics",
    market: "global",
    locale: "und",
    version: "1",
    audience: "general",
    createdAt: b.updatedAt,
    updatedAt: b.updatedAt,
    isSystem: true,
    content: {
      v: 1,
      sourcePrompt: b.sourcePrompt,
      requestedMode: mode,
      formalMeta: {
        product: "aics",
        market: "global",
        locale: "und",
        workflowType: wf,
        version: "1",
        audience: "general"
      }
    }
  };
}

function v1GetItemToDetailRow(item: Record<string, unknown>): TemplateCoreDetailRow {
  const id = String(item.id ?? "").trim();
  const title = String(item.title ?? "");
  const body =
    item.body != null && typeof item.body === "object" && !Array.isArray(item.body)
      ? (item.body as Record<string, unknown>)
      : {};
  const scope = String(item.scope ?? "user");
  const saveDesc = typeof body.saveDescription === "string" ? body.saveDescription : "";
  const formal =
    body.formalMeta && typeof body.formalMeta === "object" && !Array.isArray(body.formalMeta)
      ? (body.formalMeta as Record<string, unknown>)
      : {};
  const workflowType =
    (typeof body.saveWorkflowType === "string" && body.saveWorkflowType) ||
    (typeof formal.workflowType === "string" && formal.workflowType) ||
    "";
  const description = saveDesc.trim() ? saveDesc : "";
  return {
    templateId: id,
    title,
    description,
    workflowType,
    product: String(item.product ?? formal.product ?? "aics"),
    market: String(item.market ?? formal.market ?? "global"),
    locale: String(item.locale ?? formal.locale ?? "und"),
    version: typeof formal.version === "string" ? formal.version : "1",
    audience: typeof formal.audience === "string" ? formal.audience : "general",
    sourceTaskId: typeof body.sourceTaskId === "string" ? body.sourceTaskId : "",
    sourceResultId: typeof body.sourceResultId === "string" ? body.sourceResultId : "",
    createdAt: String(item.createdAt ?? ""),
    updatedAt: String(item.updatedAt ?? ""),
    isSystem: scope === "global",
    content: body
  };
}

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
    const sk = `save${k.charAt(0).toUpperCase()}${k.slice(1)}` as keyof typeof co;
    const sv = co[sk as string];
    if (typeof sv === "string" && sv.trim()) return sv.trim();
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

/** E-3：自 Core content 规范化，供执行链使用的稳定结构 */
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

/** GET /v1/templates/:id；sys-* 无远端行时走内置合成 */
export async function fetchTemplateById(templateId: string): Promise<TemplateCoreDetailRow> {
  const tid = templateId.trim();
  if (!tid) throw new Error("invalid_template_id");

  const local = builtinTemplateDetail(tid);
  const { data: raw, status } = await apiClient.get<unknown>(`/v1/templates/${encodeURIComponent(tid)}`, {
    validateStatus: () => true
  });

  if (status === 404) {
    if (local) return local;
    throw new Error("template not found");
  }

  if (status < 200 || status >= 300) {
    if (local) return local;
    const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const msg = typeof o.message === "string" ? o.message : `HTTP ${status}`;
    throw new Error(msg || "请求失败");
  }

  const inner = normalizeV1ResponseBody(raw) as { item?: Record<string, unknown> };
  const item = inner.item;
  if (!item || typeof item !== "object") {
    if (local) return local;
    throw new Error("invalid_template_detail");
  }
  return v1GetItemToDetailRow(item as Record<string, unknown>);
}

