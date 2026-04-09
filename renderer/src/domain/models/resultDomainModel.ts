/**
 * D-7-4T：AICS Domain — 统一结果（与 TaskResult 语义对齐的收口形态）。
 */

export type ResultDomainKind = "content" | "computer";

export type ResultDomainModel = {
  /** 会话内映射时可能未知；详情缓存 / 历史回放路径应提供 */
  taskId?: string;
  kind: ResultDomainKind;
  title: string;
  body: string;
  summary?: string;
  hash?: string;
  hasCoreSync?: boolean;
};
