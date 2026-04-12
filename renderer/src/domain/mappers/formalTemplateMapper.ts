import type { FormalTemplateRecord } from "../models/formalTemplateRecord";
import type { TemplateDomainModel } from "../models/templateDomainModel";

/** 将 Core模板列表单行（含 GET /v1/templates 归一项）normalize 为正式记录；非法则返回 null。 */
export function normalizeFormalTemplateRow(raw: unknown): FormalTemplateRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const templateId = typeof r.templateId === "string" ? r.templateId.trim() : "";
  if (!templateId) return null;

  return {
    templateId,
    userId: typeof r.userId === "string" ? r.userId : "",
    templateType: typeof r.templateType === "string" ? r.templateType : "workflow",
    title: typeof r.title === "string" ? r.title : "",
    description: typeof r.description === "string" ? r.description : "",
    product: typeof r.product === "string" ? r.product : "aics",
    market: typeof r.market === "string" ? r.market : "global",
    locale: typeof r.locale === "string" ? r.locale : "und",
    workflowType: typeof r.workflowType === "string" ? r.workflowType : "",
    version: typeof r.version === "string" ? r.version : "1",
    audience: typeof r.audience === "string" ? r.audience : "general",
    isSystem: r.isSystem === true,
    isFavorite: r.isFavorite === true,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : "",
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : ""
  };
}

/** 兼容既有 UI / 工作台 URL 使用 `id` / `name` 的域模型（不替代 FormalTemplateRecord）。 */
export function formalTemplateToDomainModel(t: FormalTemplateRecord): TemplateDomainModel {
  return {
    id: t.templateId,
    name: t.title,
    description: t.description.trim() ? t.description : undefined,
    workflowType: t.workflowType,
    platform: t.market || t.product,
    updatedAt: t.updatedAt || t.createdAt,
    source: t.isSystem ? "system" : "user"
  };
}
