/**
 * F-3A / G-1A：结果来源与可信度策略唯一入口。
 * — 禁止在 UI 或 executor 内分散推导 ResultSource / outputTrust
 * — AI 路径的 Wire 语义见 `metadata.aiOutcome`（与 `parseSharedCoreAiExecuteResponse` / Shared Core 对齐）
 */
import type { ContentExecutionResult } from "../content/contentResultTypes";
import type { ExecutionPlanStep } from "../workbench/execution/executionPlanTypes";
import { isLocalExecutionStepType } from "../workbench/execution/executionPlanTypes";
import type { AiContentWireOutcome } from "../ai/aiContentWireTypes";
import type { ContentTaskResult, ResultProvenance, ResultSource, TaskResult, OutputTrust } from "./resultTypes";
import { trustSupplementForAiOutcome } from "./resultProvenanceUi";

/**
 * G-1：`generate` / 前序 content 的 `summarize` 经 Shared Core `POST /v1/ai/execute`；`resultSourceType` 映射为 `resultSource` / `aiOutcome`。
 * 本开关仅影响**未走 Router 的本地占位链路**（如 computer 摘要占位）。
 */
export const CONTENT_PIPELINE_USES_REAL_AI = false;

const PLACEHOLDER: ResultSource = "mock";

/** 未接 Router 的本地占位成功路径（非内容主链路） */
export function contentPipelinePlaceholderSuccessSource(): ResultSource {
  return CONTENT_PIPELINE_USES_REAL_AI ? "ai_result" : PLACEHOLDER;
}

/** 明确降级（如无可用前序内容） */
export function contentExecutionExplicitFallbackSource(): ResultSource {
  return "fallback";
}

export const RESULT_SOURCE_CAPABILITY: ResultSource = "capability_result";

export const RESULT_SOURCE_LOCAL_RUNTIME: ResultSource = "local_runtime";

export function capabilityStepTaskResultSource(): ResultSource {
  return RESULT_SOURCE_CAPABILITY;
}

export function localRuntimeStepTaskResultSource(): ResultSource {
  return RESULT_SOURCE_LOCAL_RUNTIME;
}

/** Executor 未写出 resultSource 且无法从 TaskResult 推断时的保守标记（非 mock，避免伪装成占位生成） */
export function missingContentStepResultSource(): ResultSource {
  return "fallback";
}

export function isNonProductionResultSource(s: ResultSource): boolean {
  return s === "mock" || s === "fallback";
}

/**
 * 写入 step.output / 计划状态时的来源解析（集中替代各处的 ?? "mock"）。
 */
export function resolveContentStepOutputSource(
  unified: TaskResult | null,
  raw: Pick<ContentExecutionResult, "resultSource">
): ResultSource {
  if (unified?.kind === "content" && unified.resultSource) return unified.resultSource;
  if (raw.resultSource) return raw.resultSource;
  return missingContentStepResultSource();
}

/** 汇总流水线：由每步 TaskResult 反推贡献来源 */
export function resultSourceForExecutionPlanContribution(step: ExecutionPlanStep, r: TaskResult): ResultSource {
  if (isLocalExecutionStepType(step.type)) return RESULT_SOURCE_LOCAL_RUNTIME;
  if (r.kind !== "content") return PLACEHOLDER;
  if (r.resultSource) return r.resultSource;
  if (r.action === "capability") return RESULT_SOURCE_CAPABILITY;
  if (r.action === "local_runtime") return RESULT_SOURCE_LOCAL_RUNTIME;
  return PLACEHOLDER;
}

/** 汇总结果主来源（展示优先级） */
export function primaryAggregateResultSource(sources: ResultSource[]): ResultSource {
  if (sources.includes("error")) return "error";
  if (sources.includes("ai_result")) return "ai_result";
  if (sources.includes(RESULT_SOURCE_LOCAL_RUNTIME)) return RESULT_SOURCE_LOCAL_RUNTIME;
  if (sources.includes(RESULT_SOURCE_CAPABILITY)) return RESULT_SOURCE_CAPABILITY;
  if (sources.includes("fallback")) return "fallback";
  return PLACEHOLDER;
}

export function provenanceAuthenticityFromDistinctSources(sources: ResultSource[]): ResultProvenance["authenticity"] {
  const u = new Set(sources);
  if (u.has("ai_result") && !u.has("mock") && !u.has("fallback")) return "ai_production";
  if (u.has(RESULT_SOURCE_LOCAL_RUNTIME) || u.has(RESULT_SOURCE_CAPABILITY)) return "mixed";
  return "simulated";
}

/**
 * 由去重的来源列表计算可信度（页面禁止自行推导）。
 */
export function computeOutputTrustFromDistinctSources(sources: ResultSource[]): OutputTrust {
  if (sources.length === 0) return "non_authentic";
  if (sources.includes("error")) return "error";
  const hasNonProduction = sources.some(isNonProductionResultSource);
  const hasProductionLike = sources.some(
    (s) => s === "ai_result" || s === RESULT_SOURCE_CAPABILITY || s === RESULT_SOURCE_LOCAL_RUNTIME
  );
  if (hasNonProduction && hasProductionLike) return "mixed";
  if (hasNonProduction) return "non_authentic";
  return "authentic";
}

/** 读取 metadata.outputTrust，兼容 F-3 旧值 */
export function normalizeStoredOutputTrust(raw: unknown): OutputTrust | undefined {
  if (raw === "authentic" || raw === "non_authentic" || raw === "mixed" || raw === "error") return raw;
  if (raw === "production_ready") return "authentic";
  if (raw === "non_production") return "mixed";
  return undefined;
}

export type ContentTrustPresentation = {
  distinctSources: ResultSource[];
  outputTrust: OutputTrust;
  chipSources: ResultSource[];
  legacySourceUnknown: boolean;
  /** G-1A：来自 metadata.aiOutcome（与 generate/summarize 共用） */
  aiOutcome?: AiContentWireOutcome;
  /** 成功态补充说明（如 Stub），由 resultProvenanceUi 统一提供 */
  trustSupplementZh?: string;
};

/**
 * 结果区展示：老数据无 resultProvenance / 无 resultSource 时不捏造 mock， chips 为空并由 legacy 标记走统一文案。
 */
export function resolveContentTrustPresentation(result: ContentTaskResult): ContentTrustPresentation {
  const meta = result.metadata;
  const record = meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : undefined;
  const prov = record?.resultProvenance as ResultProvenance | undefined;
  const trustFromStore = record ? normalizeStoredOutputTrust(record.outputTrust) : undefined;

  let distinct: ResultSource[];
  let legacySourceUnknown = false;

  if (prov?.distinctSources && prov.distinctSources.length > 0) {
    distinct = prov.distinctSources;
  } else if (result.resultSource) {
    distinct = [result.resultSource];
  } else {
    distinct = [];
    legacySourceUnknown = true;
  }

  let outputTrust =
    trustFromStore ?? computeOutputTrustFromDistinctSources(distinct.length > 0 ? distinct : []);

  const aiOutcomeRaw = record?.aiOutcome;
  const aiOutcome =
    typeof aiOutcomeRaw === "string" && aiOutcomeRaw.trim()
      ? (aiOutcomeRaw.trim() as AiContentWireOutcome)
      : undefined;

  if (aiOutcome === "local_stub") {
    outputTrust = "non_authentic";
  }

  const trustSupplementZh = trustSupplementForAiOutcome(aiOutcome);

  const chipSources = legacySourceUnknown ? [] : distinct;

  return {
    distinctSources: distinct,
    outputTrust,
    chipSources,
    legacySourceUnknown,
    aiOutcome,
    trustSupplementZh
  };
}

export function hasNonAuthenticOutput(trust: OutputTrust): boolean {
  return trust === "non_authentic" || trust === "mixed";
}
