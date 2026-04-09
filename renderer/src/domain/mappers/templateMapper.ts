/**
 * D-7-4T：模板 store / 列表形 → TemplateDomainModel
 */

import type { Template } from "../../modules/templates/types/template";
import type { TemplateDomainModel } from "../models/templateDomainModel";

/** 列表摘要最小输入（避免对 templateService 的类型环依赖） */
export type TemplateListLike = {
  id: string;
  name: string;
  description?: string;
  platform?: string;
  workflowType?: string;
  updatedAt: string;
  source: "system" | "user";
};

export function templateListLikeToDomainModel(row: TemplateListLike): TemplateDomainModel {
  return {
    id: row.id,
    name: row.name,
    description: row.description?.trim() || undefined,
    workflowType: row.workflowType?.trim() ?? "",
    platform: row.platform?.trim() ?? "",
    updatedAt: row.updatedAt,
    source: row.source
  };
}

export function templateStoredToDomainModel(t: Template): TemplateDomainModel {
  return {
    id: t.id,
    name: t.name,
    description: t.description?.trim() || undefined,
    sourceTaskId: t.sourceTaskId.trim() || undefined,
    sourceRunId: t.sourceRunId?.trim() || undefined,
    workflowType: t.workflowType?.trim() ?? "",
    platform: t.platform?.trim() ?? "",
    updatedAt: (t.lastUsedAt || t.createdAt).trim(),
    source: "user"
  };
}
