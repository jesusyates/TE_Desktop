/**
 * P0：失败 / 降级结果区 — 用户可读主文案与技术详情分离（唯一映射入口）。
 */

import type { ResultSource, TaskResult } from "./resultTypes";

export type FailureTitleKind = "task_incomplete" | "generation_failed" | "degraded_placeholder";

export type FailureResultPresentation = {
  titleKind: FailureTitleKind;
  /** 主区标题（短） */
  title: string;
  /** 主文案（§四 主文案） */
  primary: string;
  /** 补充一句原因（可空） */
  secondary: string;
  /** §四 副文案 / 用户下一步 */
  nextStep: string;
  /** 规则名，供 DEV / 技术详情 */
  matchedRule: string;
  /** 供折叠区展示 */
  technical: {
    rawCombined: string;
    errorCodeGuess: string;
  };
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function pickMetaCode(meta: Record<string, unknown> | undefined): string {
  if (!meta) return "";
  const a = meta.errorCode;
  if (typeof a === "string" && a.trim()) return a.trim();
  const b = meta.fallbackErrorCode;
  if (typeof b === "string" && b.trim()) return b.trim();
  const c = meta.coreErrorCode;
  if (typeof c === "string" && c.trim()) return c.trim();
  return "";
}

/**
 * 自 stream / session / 结果元数据推断失败态展示（不解析 Controller 正文）。
 */
export function buildFailureResultPresentation(input: {
  streamError: string | null | undefined;
  lastErrorMessage: string;
  unifiedResult?: TaskResult | null;
}): FailureResultPresentation {
  const stream = (input.streamError ?? "").trim();
  const last = (input.lastErrorMessage ?? "").trim();
  const rawCombined = stream || last;
  const n = norm(rawCombined);
  const meta =
    input.unifiedResult?.kind === "content"
      ? (input.unifiedResult.metadata as Record<string, unknown> | undefined)
      : undefined;
  const code = pickMetaCode(meta);

  const codeNorm = norm(code);

  if (codeNorm.includes("ai_degraded") || n.includes("ai_degraded") || n.includes("degraded_streak")) {
    return {
      titleKind: "degraded_placeholder",
      title: "已降级返回占位结果",
      primary: "当前 AI 调用连续失败过多，已暂时进入降级保护。",
      secondary: "",
      nextStep: "请稍后重试，或检查网络与账户状态。",
      matchedRule: "ai_degraded_streak",
      technical: { rawCombined, errorCodeGuess: code || "ai_degraded_streak" }
    };
  }

  if (
    codeNorm.includes("quota") ||
    n.includes("quota_exceeded") ||
    n.includes("quota") ||
    n.includes("额度") ||
    n.includes("配额")
  ) {
    return {
      titleKind: "task_incomplete",
      title: "任务未完成",
      primary: "当前额度不足，无法完成本次生成。",
      secondary: "",
      nextStep: "请检查套餐、配额或账单状态后再试。",
      matchedRule: "QUOTA_EXCEEDED",
      technical: { rawCombined, errorCodeGuess: code || "QUOTA_EXCEEDED" }
    };
  }

  if (
    last === "mock_failure" ||
    n.includes("mock output only") ||
    n.includes("no ai model was invoked") ||
    codeNorm === "mock"
  ) {
    return {
      titleKind: "degraded_placeholder",
      title: "已降级返回占位结果",
      primary: "当前未获得真实 AI 结果，已返回占位结果。",
      secondary: "",
      nextStep: "请稍后重试，或检查当前能力是否可用。",
      matchedRule: "mock",
      technical: { rawCombined, errorCodeGuess: code || "mock" }
    };
  }

  if (n.includes("fallback") || codeNorm.includes("fallback")) {
    return {
      titleKind: "degraded_placeholder",
      title: "已降级返回占位结果",
      primary: "本次返回为降级结果。",
      secondary: "",
      nextStep: "结果并非完整 AI 输出，仅供参考。",
      matchedRule: "fallback",
      technical: { rawCombined, errorCodeGuess: code || "fallback" }
    };
  }

  if (
    codeNorm.includes("ai_execution") ||
    n.includes("ai_execution_failed") ||
    n.includes("upstream") ||
    n.includes("econnreset") ||
    n.includes("etimedout") ||
    n.includes("timeout") ||
    n.includes("502") ||
    n.includes("503") ||
    n.includes("504")
  ) {
    return {
      titleKind: "generation_failed",
      title: "本次生成失败",
      primary: "本次 AI 生成失败，未返回有效结果。",
      secondary: "",
      nextStep: "你可以稍后重试，或修改提示词后重新发送。",
      matchedRule: "AI_EXECUTION_FAILED",
      technical: { rawCombined, errorCodeGuess: code || "AI_EXECUTION_FAILED" }
    };
  }

  return {
    titleKind: "generation_failed",
    title: "本次生成失败",
    primary: "本次 AI 生成失败，未返回有效结果。",
    secondary: "",
    nextStep: "请稍后重试，或修改提示词后重新发送。若问题持续，请检查网络与账户状态。",
    matchedRule: "default",
    technical: { rawCombined, errorCodeGuess: code || "" }
  };
}

export type DegradedSuccessBanner = {
  title: string;
  primary: string;
  nextStep: string;
  matchedRule: "mock" | "fallback" | "none";
};

/** success 但来源为 mock/fallback 时的主区短文案（不替换正文时作横幅） */
export function buildDegradedSuccessBanner(args: {
  resultSource: ResultSource | undefined;
}): DegradedSuccessBanner | null {
  const s = args.resultSource;
  if (s === "mock") {
    return {
      title: "已降级返回占位结果",
      primary: "当前未获得真实 AI 结果，已返回占位结果。",
      nextStep: "请稍后重试，或检查当前能力是否可用。",
      matchedRule: "mock"
    };
  }
  if (s === "fallback") {
    return {
      title: "已降级返回占位结果",
      primary: "本次返回为降级结果。",
      nextStep: "结果并非完整 AI 输出，仅供参考。",
      matchedRule: "fallback"
    };
  }
  return null;
}
