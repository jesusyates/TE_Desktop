/**
 * Content Intelligence / Multi-Agent Orchestration（立项层）
 *
 * 定位：工作台背后的智能调度层 — 非独立聊天页；须服从 Execution Timeline、Step System、
 * History、Memory、Template、Safety；禁止平级代理失控并行；所有代理输出须结构化、可审计。
 *
 * Phase 1：单模型伪多智能体 — 客户端顺序产出结构化步骤（Librarian / Strategist 为本地可解释逻辑；
 * Writer 正文、Critic 深度判罚走统一 Core / AI Router，不在此模块内绕链）。
 */

export type AgentRoleId =
  | "controller"
  | "librarian"
  | "strategist"
  | "writer"
  | "critic"
  | "finalizer"
  | "safety_checker";

/** 对用户可见的内容动作建议（验收：新写 / 续写 / 改写 / 更新旧文） */
export type ContentActionKind = "new_article" | "continue_series" | "rewrite" | "update_existing";

export type DuplicateRiskLevel = "low" | "medium" | "high";

export type StructuredAgentOutput = {
  role: AgentRoleId;
  /** 一句话人读摘要 */
  summary: string;
  /** 可序列化、可回放载荷 */
  payload: Record<string, unknown>;
  ts: string;
};

export type IntelOrchestrationTrace = {
  orchestrationId: string;
  /** Phase1：顺序步骤，可映射到 Timeline / 审计 */
  steps: StructuredAgentOutput[];
  relatedHistoryIds: string[];
  /** 预留：与统一 Safety 对齐的说明位 */
  safetyNotes: string[];
};

export type SimilarHistoryHit = {
  historyId: string;
  score: number;
  promptExcerpt: string;
  previewExcerpt?: string;
  status: string;
};
