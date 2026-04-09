import type {
  SaveTemplateFromTaskInput,
  Template,
  TemplateVariable,
  TemplateVariableType
} from "../types/template";

const STORAGE_KEY = "aics.templateLibrary.v1";

const VAR_TYPES = new Set<TemplateVariableType>(["text", "textarea", "number", "select"]);

function isTemplateVariableShape(x: unknown): x is TemplateVariable {
  if (x == null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.key !== "string") return false;
  if (typeof o.label !== "string") return false;
  if (typeof o.type !== "string" || !VAR_TYPES.has(o.type as TemplateVariableType)) return false;
  if (o.required !== undefined && typeof o.required !== "boolean") return false;
  if (o.defaultValue !== undefined && typeof o.defaultValue !== "string") return false;
  if (o.placeholder !== undefined && typeof o.placeholder !== "string") return false;
  if (o.options !== undefined) {
    if (!Array.isArray(o.options)) return false;
    if (!(o.options as unknown[]).every((t) => typeof t === "string")) return false;
  }
  return true;
}

function normalizeVariable(v: TemplateVariable): TemplateVariable {
  return {
    id: String(v.id),
    key: String(v.key).trim(),
    label: String(v.label).trim() || String(v.key).trim(),
    type: VAR_TYPES.has(v.type) ? v.type : "text",
    required: Boolean(v.required),
    defaultValue: v.defaultValue != null && v.defaultValue !== "" ? String(v.defaultValue) : undefined,
    placeholder: v.placeholder != null && v.placeholder !== "" ? String(v.placeholder) : undefined,
    options:
      v.type === "select" && Array.isArray(v.options)
        ? v.options.map((s) => String(s).trim()).filter(Boolean)
        : undefined
  };
}

function safeParse(raw: string | null): Template[] {
  if (raw == null || raw === "") return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(isTemplateShape).map(normalizeLoadedTemplate);
  } catch {
    return [];
  }
}

function isTemplateShape(x: unknown): x is Template {
  if (x == null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const rs = o.resultSnapshot;
  if (rs == null || typeof rs !== "object") return false;
  const r = rs as Record<string, unknown>;
  if (o.category !== undefined && typeof o.category !== "string") return false;
  for (const k of ["product", "market", "locale", "version", "audience"] as const) {
    if (o[k] !== undefined && typeof o[k] !== "string") return false;
  }
  if (o.platform !== undefined && typeof o.platform !== "string") return false;
  if (o.workflowType !== undefined && typeof o.workflowType !== "string") return false;
  if (o.sourceRunId !== undefined && typeof o.sourceRunId !== "string") return false;
  if (
    o.sourceResultKind !== undefined &&
    o.sourceResultKind !== "content" &&
    o.sourceResultKind !== "computer" &&
    o.sourceResultKind !== "none"
  ) {
    return false;
  }
  if (o.tags !== undefined && !Array.isArray(o.tags)) return false;
  if (o.tags !== undefined && !(o.tags as unknown[]).every((t) => typeof t === "string")) return false;
  if (o.variables !== undefined) {
    if (!Array.isArray(o.variables)) return false;
    if (!(o.variables as unknown[]).every(isTemplateVariableShape)) return false;
  }
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.description === "string" &&
    typeof o.sourceTaskId === "string" &&
    typeof o.sourcePrompt === "string" &&
    typeof o.createdAt === "string" &&
    typeof o.lastUsedAt === "string" &&
    Array.isArray(o.stepsSnapshot) &&
    typeof r.title === "string" &&
    typeof r.bodyPreview === "string" &&
    typeof r.stepCount === "number"
  );
}

function normalizeLoadedTemplate(row: Template): Template {
  const tags = Array.isArray(row.tags)
    ? row.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const cat = row.category?.trim();
  const variables = Array.isArray(row.variables)
    ? row.variables.filter(isTemplateVariableShape).map(normalizeVariable)
    : undefined;
  const product = row.product?.trim();
  const market = row.market?.trim();
  const locale = row.locale?.trim();
  const version = row.version?.trim();
  const audience = row.audience?.trim();
  const platform = row.platform?.trim();
  const workflowType = row.workflowType?.trim();
  const sourceRunId = row.sourceRunId?.trim();
  const srk = row.sourceResultKind;
  const sourceResultKind =
    srk === "content" || srk === "computer" || srk === "none" ? srk : undefined;
  return {
    ...row,
    tags,
    category: cat || undefined,
    product: product || undefined,
    market: market || undefined,
    locale: locale || undefined,
    version: version || undefined,
    audience: audience || undefined,
    platform: platform || undefined,
    workflowType: workflowType || undefined,
    sourceRunId: sourceRunId || undefined,
    sourceResultKind,
    variables: variables?.length ? variables : undefined
  };
}

function newTemplateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sortTemplatesByCreatedDesc(a: Template, b: Template): number {
  return b.createdAt.localeCompare(a.createdAt);
}

/** D-7-4C：纯本地追加并落盘（供 hook / templateService 共用） */
export function appendTemplateToLibrary(input: SaveTemplateFromTaskInput): Template {
  const now = new Date().toISOString();
  const row: Template = {
    id: newTemplateId(),
    name: input.name.trim() || "未命名模板",
    description: (input.description ?? "").trim(),
    product: input.product?.trim() || undefined,
    market: input.market?.trim() || undefined,
    locale: input.locale?.trim() || undefined,
    version: input.version?.trim() || undefined,
    audience: input.audience?.trim() || undefined,
    platform: input.platform?.trim() || undefined,
    workflowType: input.workflowType?.trim() || undefined,
    sourceTaskId: input.sourceTaskId.trim(),
    sourceRunId: input.sourceRunId?.trim() || undefined,
    sourceResultKind: input.sourceResultKind,
    sourcePrompt: input.sourcePrompt,
    createdAt: now,
    lastUsedAt: now,
    stepsSnapshot: input.stepsSnapshot,
    resultSnapshot: input.resultSnapshot,
    tags: Array.isArray(input.tags)
      ? input.tags.map((x) => String(x).trim()).filter(Boolean)
      : [],
    category: input.category?.trim() || undefined,
    attachmentSchema: input.attachmentSchema,
    inputSchema: input.inputSchema
  };
  const prev = loadTemplatesFromStorage();
  const next = [row, ...prev].sort(sortTemplatesByCreatedDesc);
  persistTemplatesToStorage(next);
  return row;
}

/** E-2：服务端已分配 templateId 时落盘（与 Core 对齐） */
export function appendTemplateToLibraryWithServerId(
  input: SaveTemplateFromTaskInput,
  serverId: string
): Template {
  const id = serverId.trim();
  if (!id) throw new Error("server_template_id_required");
  const now = new Date().toISOString();
  const row: Template = {
    id,
    name: input.name.trim() || "未命名模板",
    description: (input.description ?? "").trim(),
    product: input.product?.trim() || undefined,
    market: input.market?.trim() || undefined,
    locale: input.locale?.trim() || undefined,
    version: input.version?.trim() || undefined,
    audience: input.audience?.trim() || undefined,
    platform: input.platform?.trim() || undefined,
    workflowType: input.workflowType?.trim() || undefined,
    sourceTaskId: input.sourceTaskId.trim(),
    sourceRunId: input.sourceRunId?.trim() || undefined,
    sourceResultKind: input.sourceResultKind,
    sourcePrompt: input.sourcePrompt,
    createdAt: now,
    lastUsedAt: now,
    stepsSnapshot: input.stepsSnapshot,
    resultSnapshot: input.resultSnapshot,
    tags: Array.isArray(input.tags)
      ? input.tags.map((x) => String(x).trim()).filter(Boolean)
      : [],
    category: input.category?.trim() || undefined,
    attachmentSchema: input.attachmentSchema,
    inputSchema: input.inputSchema
  };
  const prev = loadTemplatesFromStorage();
  const next = [row, ...prev.filter((t) => t.id !== id)].sort(sortTemplatesByCreatedDesc);
  persistTemplatesToStorage(next);
  return row;
}

export function loadTemplatesFromStorage(): Template[] {
  if (typeof localStorage === "undefined") return [];
  return safeParse(localStorage.getItem(STORAGE_KEY));
}

export function persistTemplatesToStorage(templates: Template[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // 配额或隐私模式：静默失败，内存态仍可用
  }
}
