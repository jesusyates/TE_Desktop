/**
 * AI Router v1 — Core 返回的调度决策（占位，不真实多模型调用）。
 */
export type RouterExecutionMode = "cloud_ai" | "local_only" | "hybrid";

export type RouterDecision = {
  executionMode: RouterExecutionMode;
  model: string;
  params: {
    temperature: number;
    maxTokens: number;
  };
  reason: string;
  fallback?: {
    mode: string;
  };
};
