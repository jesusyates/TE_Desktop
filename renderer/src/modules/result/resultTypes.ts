/**
 * D-5-9：系统正式统一结果抽象（UI 通过 adapter 消费，不直接绑 executor 原始类型）。
 */

/** F-3：结果来源（可解释性/信任基线） */
export type ResultSource =
  | "ai_result"
  | "capability_result"
  | "local_runtime"
  | "mock"
  | "fallback"
  | "error";

/** F-3A：与 execution success 正交的可信度（由 resultSourcePolicy 统一计算） */
export type OutputTrust = "authentic" | "non_authentic" | "mixed" | "error";

/** F-3：流水线汇总附带的来源分解 */
export type ResultProvenance = {
  steps: Array<{ stepId: string; stepType: string; source: ResultSource }>;
  distinctSources: ResultSource[];
  authenticity: "simulated" | "mixed" | "ai_production";
};

export type ResultKind = "content" | "computer";

export interface BaseTaskResult {
  kind: ResultKind;
  title: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export interface ContentTaskResult extends BaseTaskResult {
  kind: "content";
  body: string;
  action?: string;
  stepCount?: number;
  durationMs?: number;
  /** F-3：本 content 结果的主来源（汇总与单步均可能携带） */
  resultSource?: ResultSource;
}

export interface ComputerTaskResult extends BaseTaskResult {
  kind: "computer";
  body?: string;
  environmentLabel?: string;
  targetApp?: string;
  stepCount?: number;
  eventCount?: number;
}

export type TaskResult = ContentTaskResult | ComputerTaskResult;
