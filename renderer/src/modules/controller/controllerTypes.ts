/**
 * Controller 决策引擎 v1 — 唯一主控编排契约（客户端权威壳 + 与 Core analyze/plan 对齐的决策追踪）。
 * 子能力不得绕开 Controller 的全局执行门闩（会话仍走 trust / safety / session.start）。
 */

export type TaskClassification = "content" | "research" | "local" | "mixed" | "automation_reserved";

export type ComplexityTier = "simple" | "medium" | "complex";

/** 与 Trust L 分层语义对齐的可解释档位（Controller 侧重「任务级」） */
export type ControllerRiskLevel = "L0" | "L1" | "L2" | "L3" | "L4";

export type ExecutionStrategy = "direct" | "pipeline" | "multi_agent_graph";

/**
 * 注册表级 agent 类型（与产品文档一致；`scanner` 对应 local_executor 能力位）
 */
export type ControllerAgentId =
  | "planner"
  | "librarian"
  | "strategist"
  | "writer"
  | "critic"
  | "localization"
  | "scanner"
  | "safety";

export type ControllerStepStatus = "pending" | "running" | "success" | "error";

export type ControllerStepV1 = {
  id: string;
  agent: ControllerAgentId;
  /** 人读目的，禁止笼统「AI 思考中」 */
  purpose: string;
  status: ControllerStepStatus;
  /** 输入溯源标签（可审计） */
  inputSource: string;
};

/** 与模板正式字段对齐的摘要（可写入计划与 localStorage 回放） */
export type ControllerTemplateFormalMetaV1 = {
  product?: string;
  market?: string;
  locale?: string;
  workflowType?: string;
  version?: string;
  audience?: string;
};

/** 执行复用层：本轮自模板启动时的溯源（无模板则无此字段） */
export type ControllerTemplateProvenanceV1 = {
  source: "template";
  templateId: string;
  displayName: string;
  formalMeta: ControllerTemplateFormalMetaV1;
};

export type ControllerPlanV1 = {
  version: 1;
  classification: TaskClassification;
  complexity: ComplexityTier;
  riskLevel: ControllerRiskLevel;
  requiresUserConfirmation: boolean;
  riskRationale: string[];
  strategy: ExecutionStrategy;
  /** 复杂任务：图编排结构预留（本轮不执行真实 graph） */
  graphReserved: boolean;
  /**
   * 图编排语义落地说明：避免 graphReserved 长期无绑定解释。
   * `reserved_executes_as_linear_pipeline` = 本轮仍走受控线性流水线，图能力延后。
   */
  graphBinding: "none" | "reserved_executes_as_linear_pipeline";
  steps: ControllerStepV1[];
  /** 面向用户与审计的一小段说明 */
  explanation: string;
  /** 键值决策追踪，可回放 */
  decisionTrace: Record<string, string>;
  /** 可选：模板复用层来源与元数据摘要 */
  templateProvenance?: ControllerTemplateProvenanceV1;
};

export function isControllerPlanV1(v: unknown): v is ControllerPlanV1 {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.version === 1 && typeof o.classification === "string" && Array.isArray(o.steps);
}
