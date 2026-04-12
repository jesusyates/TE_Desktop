/**
 * F-3 / F-3A / G-1A：结果来源与可信度相关文案（唯一 UI 文案源，禁止面板各写一套）。
 */
import type { AiContentWireOutcome } from "../ai/aiContentWireTypes";
import type { OutputTrust, ResultSource } from "./resultTypes";

const LABEL_ZH: Record<ResultSource, string> = {
  ai_result: "AI 生成",
  capability_result: "能力处理",
  local_runtime: "本地执行",
  mock: "模拟结果",
  fallback: "降级 / 占位",
  error: "错误"
};

/** 老数据无主来源字段时 */
export const EXECUTION_RESULT_LEGACY_SOURCE_UNKNOWN_ZH = "来源未记录（历史数据或未标注）";

/** 与降级/占位结果一同展示时的统一说明（结果区可用） */
export const RESULT_SOURCE_FALLBACK_COPY_ZH =
  "当前步骤因缺少可用输入或走降级路径产生占位说明，非生产模型完整输出。";

/** 执行失败时来源维度统一引导（可与具体错误详情并列） */
export const RESULT_SOURCE_ERROR_COPY_ZH = "执行未成功完成。以下说明供排查；来源标记为错误或非生产输出。";

// ----- G-1A：AI Router / Stub 用户可见说明（与 metadata.aiOutcome 对齐） -----

/** 开发 Stub 成功：必须与真实 Router 成功明确区分 */
export const AI_STUB_MODE_DISTINCT_NOTICE_ZH =
  "当前结果为开发环境 Stub（未调用生产模型），请勿与真实 AI 产出混淆。";

/** G-2：主模型失败后备用模型成功 — 仍为真实 AI，但与「首次即成功」区分 */
export const AI_ROUTER_FALLBACK_SUCCESS_NOTICE_ZH =
  "主模型不可用或失败，已由备用模型完成生成；输出仍为生产链路 AI 结果。";

/** Router 未配置或生产环境未开启有效推理（与 ai_router_required 等并列给用户） */
export const AI_ROUTER_NOT_CONFIGURED_USER_ZH =
  "当前环境未配置可用的 AI Router，无法生成内容。请联系管理员配置后端，或在非生产环境使用允许的本地 Stub（详见部署说明）。";

/** 上游调用失败、超时或空响应（统一口径，不区分 generate/summarize） */
export const AI_ROUTER_CALL_FAILED_USER_ZH =
  "模型服务调用失败或返回异常，请稍后重试；若持续失败请检查网络与后端 AI Router 状态。";

/** 与服务端通信失败（非业务 JSON） */
export const AI_CONTENT_TRANSPORT_USER_ZH = "无法与 AI 内容服务建立通信，请检查网络与登录状态后重试。";

/** 服务端返回数据无法解析（wire 校验失败） */
export const AI_CONTENT_WIRE_INVALID_USER_ZH = "AI 服务返回数据格式异常，请稍后重试或联系支持。";

/**
 * 成功态结果区：在 outputTrust 提示下追加的补充句（仅 Stub 强制展示）。
 */
export function trustSupplementForAiOutcome(o: AiContentWireOutcome | undefined): string | undefined {
  if (o === "local_stub") return AI_STUB_MODE_DISTINCT_NOTICE_ZH;
  if (o === "router_fallback_success") return AI_ROUTER_FALLBACK_SUCCESS_NOTICE_ZH;
  return undefined;
}

export function resultSourceLabelZh(s: ResultSource): string {
  return LABEL_ZH[s] ?? s;
}

/** 基于 F-3A outputTrust 的简短提示（取代页面自行拼句） */
export function outputTrustHintZh(trust: OutputTrust): string {
  switch (trust) {
    case "authentic":
      return "输出来源均为能力处理或生产链路下的 AI 结果（若仍处接入前环境，以单步来源为准）。";
    case "mixed":
      return "执行已成功，但输出混合了真实能力与模拟或降级步骤，请结合下方来源标签区分。";
    case "non_authentic":
      return "执行流程已结束，但输出主要为模拟、占位或历史未标注来源，非完整生产模型结果。";
    case "error":
    default:
      return "汇总或单步中包含错误标记来源，请以各步状态与说明为准。";
  }
}

/** 简化对话式工作台：完成态主句（success 与可信度分离） */
export function outputTrustSimplifiedSuccessLeadZh(trust: OutputTrust, defaultDoneTitle: string): string {
  switch (trust) {
    case "authentic":
      return defaultDoneTitle;
    case "mixed":
      return "执行已完成（输出混合能力与模拟/降级步骤）";
    case "non_authentic":
      return "执行已完成（当前输出为模拟、占位或未标注来源）";
    case "error":
      return defaultDoneTitle;
    default:
      return defaultDoneTitle;
  }
}

/** 流水线汇总卡片 summary 字段文案 */
export function pipelineAggregateSummaryZh(trust: OutputTrust): string {
  switch (trust) {
    case "authentic":
      return "多步流水线合并输出";
    case "mixed":
    case "non_authentic":
      return "多步汇总（含模拟/占位步骤时请区分下方来源说明）";
    case "error":
      return "多步汇总（部分步骤含错误来源，以各步详情为准）";
    default:
      return "多步汇总";
  }
}

/**
 * @deprecated 新代码请使用 outputTrustHintZh；保留给仍读 authenticity 的旧快照兼容。
 */
export function resultAuthenticityHintZh(authenticity: "simulated" | "mixed" | "ai_production"): string {
  switch (authenticity) {
    case "ai_production":
      return outputTrustHintZh("authentic");
    case "mixed":
      return outputTrustHintZh("mixed");
    case "simulated":
    default:
      return outputTrustHintZh("non_authentic");
  }
}
