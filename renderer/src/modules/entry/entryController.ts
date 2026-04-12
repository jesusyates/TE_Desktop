/**
 * AICS v1：入口层本地分析（analyzeTask + planTask），驱动「确认前」分支。
 * 真正执行仍经 session.start → Shared Core；此处不替代 Core /analyze。
 */

import type { TaskAttachmentMeta } from "../../types/task";
import type { TaskMode } from "../../types/taskMode";
import type { TaskAnalysisResult } from "../workbench/analyzer/taskAnalyzerTypes";
import type { ExecutionPlan } from "../workbench/execution/executionPlanTypes";
import type { TaskPlan } from "../workbench/planner/taskPlanTypes";
import { analyzeTask } from "../workbench/analyzer/taskAnalyzer";
import { planTask } from "../workbench/planner/taskPlanner";
import { loadMemorySnapshot } from "../memory/memoryStore";
import { getMemoryHintsForTaskWithPrefs } from "../preferences/memoryHintsFromPrefs";
import { computeClientTrustV1 } from "../trust/trustPolicy";
import type { CoreMemoryHintsWire } from "../memory/workbenchCoreMemoryHints";
import type { AnalyzeResult } from "./entryStage";

function mapTrustToRiskL(trustLevel: string): NonNullable<AnalyzeResult["riskLevel"]> {
  if (trustLevel === "L2") return "L3";
  if (trustLevel === "L1") return "L2";
  return "L1";
}

function buildPlanSummaryZh(stepTitles: string[], stepCount: number): string {
  if (stepCount <= 0) return "根据你的描述整理并输出可用结果。";
  const head = stepTitles.slice(0, 3).filter(Boolean);
  const tail = stepCount > 3 ? "等" : "";
  const line = head.length ? `${head.join("、")}${tail}` : "按你的需求处理";
  return `先${line}，再汇总成你要的结果。`;
}

function truncateRestate(s: string, max = 100): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function planHasRiskySteps(plan: ExecutionPlan | TaskPlan | null | undefined): boolean {
  const steps = plan?.steps;
  if (!steps?.length) return false;
  return steps.some((s) => {
    const t = (s as { type?: string }).type ?? "";
    return (
      t === "capability" ||
      t === "human" ||
      t === "human_confirm" ||
      t === "local_file_operation"
    );
  });
}

/**
 * 需弹确认再执行：高风险 / 本地与文件 / 能力步等（与「默认自动执行」互斥）。
 */
export function requiresConfirmBeforeExecute(
  entry: AnalyzeResult,
  analysis: TaskAnalysisResult,
  plan: ExecutionPlan | TaskPlan | null | undefined
): boolean {
  if (!entry.canExecute || entry.needsClarification) return false;
  const rl = entry.riskLevel ?? "L1";
  if (rl === "L4") return true;
  /** L3：仅在与本地/能力/高风险步骤相关时弹确认，避免纯云端内容生成被误拦 */
  if (rl === "L3" && (analysis.resolvedMode === "computer" || planHasRiskySteps(plan))) return true;
  if (analysis.resolvedMode === "computer") return true;
  const raw = analysis.rawPrompt;
  if (/删除|清空|格式化|覆盖|写入|发送|付费|扣费|转账|汇款|订阅|下单/i.test(raw)) return true;
  if (analysis.intent === "organize_files" || analysis.intent === "local_safe_classify") return true;
  if (planHasRiskySteps(plan)) return true;
  return false;
}

/**
 * 默认自动执行：可执行、无需追问、且不属于必须确认类。
 */
export function shouldAutoExecute(
  entry: AnalyzeResult,
  analysis: TaskAnalysisResult,
  plan: ExecutionPlan | TaskPlan | null | undefined
): boolean {
  return Boolean(
    entry.canExecute && !entry.needsClarification && !requiresConfirmBeforeExecute(entry, analysis, plan)
  );
}

/** 高风险文案（继续/取消）；否则为轻确认（开始/取消） */
export function isHighRiskConfirmTone(analysis: TaskAnalysisResult, entry: AnalyzeResult): boolean {
  const raw = analysis.rawPrompt;
  if (/删除|清空|格式化|永久|不可恢复|rm |unlink/i.test(raw)) return true;
  if (entry.riskLevel === "L4") return true;
  if (analysis.intent === "organize_files") return true;
  return false;
}

function riskHintForHigh(analysis: TaskAnalysisResult): string {
  const raw = analysis.rawPrompt;
  if (/删除|清空|永久|不可恢复/i.test(raw)) return "不可恢复地改动或删除文件";
  if (analysis.resolvedMode === "computer") return "访问或修改你电脑上的文件与文件夹";
  if (/发送|传出|上传|提交/i.test(raw)) return "把内容发到外部或第三方";
  if (/付费|扣费|订阅|下单/i.test(raw)) return "产生费用或扣减额度";
  return "影响你的本地数据或账户";
}

export function buildHighRiskConfirmMessage(
  userLine: string,
  _entry: AnalyzeResult,
  analysis: TaskAnalysisResult
): string {
  const restate = truncateRestate(userLine);
  const risk = riskHintForHigh(analysis);
  return `我理解你的意思是：${restate}\n\n这个操作可能会 ${risk}，需要我继续吗？`;
}

export function buildLightConfirmMessage(oneLiner: string): string {
  const body = oneLiner.trim() || "按你的描述生成并整理结果。";
  return `我可以这样帮你处理：\n\n${body}\n\n要我现在开始吗？`;
}

/**
 * 本地快速分析：是否可执行、是否需追问、给用户的 plan 摘要。
 */
export async function runLocalEntryAnalyze(input: {
  prompt: string;
  requestedMode: TaskMode;
  attachments?: TaskAttachmentMeta[];
}): Promise<AnalyzeResult> {
  const p = input.prompt.trim();
  if (p.length < 4) {
    return {
      canExecute: false,
      needsClarification: true,
      clarificationLine: "我还不太确定你想做什么，能再具体说一句话吗？",
      questions: [],
      riskLevel: "L1"
    };
  }

  const pre = analyzeTask({
    prompt: input.prompt,
    attachments: input.attachments,
    requestedMode: input.requestedMode
  });
  const memoryHints = getMemoryHintsForTaskWithPrefs(loadMemorySnapshot(), pre, null);
  const analysis = analyzeTask({
    prompt: input.prompt,
    attachments: input.attachments,
    requestedMode: input.requestedMode,
    memoryHints
  });

  const plan = planTask(analysis, { memoryHints, taskId: "entry-v1" });
  const trust = computeClientTrustV1(plan, memoryHints as unknown as CoreMemoryHintsWire);
  const riskLevel: AnalyzeResult["riskLevel"] =
    plan.steps.some((s) => s.type === "capability") && trust.riskLevel === "L2"
      ? "L4"
      : mapTrustToRiskL(trust.riskLevel);

  const contentExecutable = analysis.resolvedMode === "content" && p.length >= 4;

  if (!analysis.shouldExecute && !contentExecutable) {
    return {
      canExecute: false,
      reason: "我没法从这句话里确定要产出什么。",
      suggestions: ["说说你想得到的结果（例如一篇文案、一段摘要）", "或要处理的对象（例如某个文件夹）"],
      riskLevel: "L1"
    };
  }

  if (
    analysis.resolvedMode === "computer" &&
    analysis.intent === "unknown" &&
    (analysis.candidateCapabilities?.length ?? 0) === 0
  ) {
    return {
      canExecute: false,
      needsClarification: true,
      clarificationLine: "我还不太确定你的意思，是想整理本地文件，还是写一段内容？",
      questions: [],
      riskLevel: "L1"
    };
  }

  const titles = plan.steps.map((s) => s.title?.trim() || s.stepId || "步骤");
  const planSummary = buildPlanSummaryZh(titles, plan.steps.length);

  return {
    canExecute: true,
    planSummary,
    riskLevel,
    needsClarification: false
  };
}

/** @deprecated 已由 buildHighRiskConfirmMessage / buildLightConfirmMessage 替代 */
export function buildEntryConfirmMessageZh(planSummary: string): string {
  return buildLightConfirmMessage(planSummary);
}

export async function handleUserInput(input: {
  prompt: string;
  requestedMode: TaskMode;
  attachments?: TaskAttachmentMeta[];
}) {
  return runLocalEntryAnalyze(input);
}
