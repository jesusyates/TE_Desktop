/**
 * D-7-4T：AICS Domain — 模板摘要 / 稳定业务字段（不替代 Template / TemplateListItem store 形）。
 */

export type TemplateDomainSource = "system" | "user";

export type TemplateDomainModel = {
  id: string;
  name: string;
  /** 列表/卡片展示用短说明（可选） */
  description?: string;
  sourceTaskId?: string;
  sourceRunId?: string;
  workflowType: string;
  platform: string;
  updatedAt: string;
  source: TemplateDomainSource;
};
