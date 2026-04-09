/**
 * E-1：AICS 模板正式结构（系统 / 用户字段统一；系统模板的 userId 为空串）。
 * 列表与详情均须 normalize 为此类型后再进入业务层。
 */

export type FormalTemplateRecord = {
  templateId: string;
  userId: string;
  templateType: string;
  title: string;
  description: string;
  product: string;
  market: string;
  locale: string;
  workflowType: string;
  version: string;
  audience: string;
  isSystem: boolean;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
};
