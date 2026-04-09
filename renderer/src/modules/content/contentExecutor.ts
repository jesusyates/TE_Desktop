import type { ComputerExecutionEvent } from "../../types/computerExecution";
import type { StylePreferencesSnapshot } from "../../types/stylePreferences";
import type { ContentTaskResult, TaskResult } from "../result/resultTypes";
import {
  contentExecutionExplicitFallbackSource,
  contentPipelinePlaceholderSuccessSource
} from "../result/resultSourcePolicy";
import { invokeAiContentOnCore } from "../../services/api";
import type { ContentExecutionInput } from "./contentActionTypes";
import type { ContentExecutionResult } from "./contentResultTypes";
import type { TemplateExecutionContext } from "../workbench/analyzer/taskAnalyzerTypes";

function stylePreferencesPreamble(sp: StylePreferencesSnapshot | undefined): string {
  if (!sp) return "";
  const lines: string[] = [];
  if (sp.tone?.trim()) lines.push(`语气：${sp.tone.trim()}`);
  if (sp.audience?.trim()) lines.push(`受众：${sp.audience.trim()}`);
  if (sp.outputLength) lines.push(`篇幅：${sp.outputLength}`);
  if (sp.languagePreference?.trim()) lines.push(`语言偏好：${sp.languagePreference.trim()}`);
  if (sp.notes?.trim()) lines.push(`备注：${sp.notes.trim()}`);
  if (!lines.length) return "";
  return ["【用户风格偏好】", ...lines, ""].join("\n");
}

function memoryReferencePreamble(lines: string[] | undefined): string {
  if (!lines?.length) return "";
  const clipped = lines
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((l) => (l.length > 100 ? `${l.slice(0, 99)}…` : l));
  if (!clipped.length) return "";
  return ["【记忆参考（轻量）】", ...clipped, ""].join("\n");
}

function templateExecutionPreamble(ctx: TemplateExecutionContext | undefined): string {
  if (!ctx) return "";
  const lines: string[] = [];
  lines.push(`模板 ID：${ctx.templateId}`);
  lines.push(`模板参考模式：${ctx.requestedMode}`);
  if (ctx.sourceResultKind && ctx.sourceResultKind !== "none") {
    lines.push(`来源结果类型：${ctx.sourceResultKind}`);
  }
  const sp = ctx.sourcePrompt?.trim();
  if (sp) {
    const clip = sp.length > 400 ? `${sp.slice(0, 399)}…` : sp;
    lines.push(`模板原文（节选）：${clip}`);
  }
  if (ctx.stepsSnapshot?.length) {
    const j = JSON.stringify(ctx.stepsSnapshot);
    lines.push(`步骤快照（节选）：${j.length > 420 ? `${j.slice(0, 419)}…` : j}`);
  }
  if (ctx.resultSnapshot !== undefined) {
    const j = JSON.stringify(ctx.resultSnapshot);
    lines.push(`结果快照（节选）：${j.length > 280 ? `${j.slice(0, 279)}…` : j}`);
  }
  return ["【模板执行上下文（Core）】", ...lines, ""].join("\n");
}

function asContentAction(action: string | undefined): ContentExecutionInput["action"] | null {
  if (action === "generate" || action === "summarize_result") return action;
  return null;
}

function summarizeFromComputerEvents(
  events: ComputerExecutionEvent[] | null | undefined,
  prompt: string
): ContentExecutionResult {
  const list = events ?? [];
  const n = list.length;
  const complete = list.find((e): e is Extract<ComputerExecutionEvent, { type: "execution.complete" }> => e.type === "execution.complete");
  const summaryLine = complete?.summary?.trim() ?? "";
  const stepCompletes = list.filter((e) => e.type === "step.complete").length;
  const hasEnv = list.some((e) => e.type === "environment.detected");
  const hasFs = list.some((e) => e.type === "app.launch" && e.appName === "File System");

  const body = [
    "系统已完成与本机文件整理相关的执行流程。",
    summaryLine ? `完成说明：${summaryLine}` : null,
    `共产生 ${n} 条执行事件；其中已完成 ${stepCompletes} 个步骤节点（含扫描、分类、创建目录、移动与重命名等阶段）。`,
    hasEnv || hasFs
      ? "执行环境已识别，文件系统通道已参与整理。"
      : null,
    "结果已按类型归档到对应子文件夹（Images / Docs / Sheets / Archives / Others，以本机实际目录为准）。"
  ]
    .filter((x): x is string => Boolean(x))
    .join("\n\n");

  const short =
    summaryLine ||
    `已根据任务「${prompt.length > 40 ? `${prompt.slice(0, 40)}…` : prompt}」完成整理摘要。`;

  return {
    type: "content",
    action: "summarize_result",
    title: "Execution Summary",
    body,
    summary: short,
    stepCount: stepCompletes > 0 ? stepCompletes : Math.max(1, Math.min(8, Math.ceil(n / 3))),
    resultSource: contentPipelinePlaceholderSuccessSource(),
    metadata: { eventCount: n, sourcePromptSnippet: prompt.slice(0, 200) }
  };
}

/**
 * G-1：基于前序 content — 经统一 `/ai/content` Router（失败抛错 → 执行步 error，无假完成）。
 */
async function summarizeFromPriorContentResults(
  previousResults: TaskResult[] | undefined,
  instructionPrompt: string
): Promise<ContentExecutionResult> {
  const contents = (previousResults ?? []).filter((r): r is ContentTaskResult => r.kind === "content");
  if (!contents.length) {
    return {
      type: "content",
      action: "summarize_result",
      title: "摘要整理",
      body: [
        "当前没有可供摘要的前序内容产出。请确保「生成」步骤已成功完成后再执行总结步骤。",
        instructionPrompt.trim() ? `\n步骤说明：${instructionPrompt.trim()}` : ""
      ]
        .filter(Boolean)
        .join(""),
      summary: "无可用前序内容",
      stepCount: 0,
      resultSource: contentExecutionExplicitFallbackSource(),
      metadata: { mode: "prior_content_summarize_empty" }
    };
  }

  const sections = contents.map((r, i) => {
    const t = (r.title || `阶段 ${i + 1}`).trim();
    const raw = (r.body || r.summary || "").trim();
    const oneLine = raw.replace(/\s+/g, " ");
    const clip = oneLine.length > 320 ? `${oneLine.slice(0, 319)}…` : oneLine;
    return `— ${t}\n  压缩摘录：${clip}`;
  });

  const routerPrompt = [
    "【摘要 / 压缩 / 结构化整理】",
    "以下仅对前序步骤已产出内容做归纳与压缩，非独立扩写。",
    "",
    ...sections,
    "",
    instructionPrompt.trim() ? `【本步整理目标】\n${instructionPrompt.trim()}` : null
  ]
    .filter((x): x is string => Boolean(x))
    .join("\n\n");

  const ai = await invokeAiContentOnCore({ action: "summarize", prompt: routerPrompt });

  return {
    type: "content",
    action: "summarize_result",
    title: "摘要与交付整理",
    body: ai.body,
    summary: ai.summary,
    stepCount: contents.length,
    resultSource: ai.resultSource,
    metadata: {
      mode: "prior_content_summarize",
      sourceSegmentCount: contents.length,
      via: "ai_router",
      aiOutcome: ai.aiOutcome
    }
  };
}

/**
 * Computer 摘要链路仍走本地占位（非内容生成主路径）；前序 content 则经 AI Router。
 */
async function summarizeFromPriorResultsAndEvents(
  previousResults: TaskResult[] | undefined,
  events: ComputerExecutionEvent[] | null | undefined,
  prompt: string
): Promise<ContentExecutionResult> {
  const fromComputer = previousResults?.find((r): r is Extract<TaskResult, { kind: "computer" }> => r.kind === "computer");
  if (fromComputer) {
    const summaryLine = fromComputer.summary?.trim() || fromComputer.body?.trim() || "";
    const stepCount = fromComputer.stepCount;
    const eventCount = fromComputer.eventCount;
    const body = [
      "系统已完成与本机文件整理相关的执行流程。",
      summaryLine ? `完成说明：${summaryLine}` : null,
      fromComputer.environmentLabel || fromComputer.targetApp
        ? `环境：${fromComputer.environmentLabel ?? "—"}；目标应用：${fromComputer.targetApp ?? "—"}`
        : null,
      typeof eventCount === "number" ? `本段 computer 执行共 ${eventCount} 条事件。` : null,
      typeof stepCount === "number" ? `其中已完成 ${stepCount} 个执行步骤节点。` : null,
      "结果已按类型归档到对应子文件夹（Images / Docs / Sheets / Archives / Others，以本机实际目录为准）。"
    ]
      .filter((x): x is string => Boolean(x))
      .join("\n\n");

    const short =
      summaryLine ||
      `已根据任务「${prompt.length > 40 ? `${prompt.slice(0, 40)}…` : prompt}」完成整理摘要。`;

    return {
      type: "content",
      action: "summarize_result",
      title: "Execution Summary",
      body,
      summary: short,
      stepCount:
        stepCount ??
        (typeof eventCount === "number" ? Math.max(1, Math.min(8, Math.ceil(eventCount / 3))) : 1),
      resultSource: contentPipelinePlaceholderSuccessSource(),
      metadata: {
        summarizeSource: "prior_computer_task_result",
        environmentLabel: fromComputer.environmentLabel,
        targetApp: fromComputer.targetApp,
        eventCount
      }
    };
  }

  const hasContent = previousResults?.some((r) => r.kind === "content");
  if (hasContent) {
    return summarizeFromPriorContentResults(previousResults, prompt);
  }

  return summarizeFromComputerEvents(events, prompt);
}

function buildGeneratePromptForRouter(
  prompt: string,
  stylePreferences?: StylePreferencesSnapshot,
  memoryReferenceLines?: string[],
  templateExecutionContext?: TemplateExecutionContext
): string {
  const safe = prompt.trim() || "（空任务描述）";
  const pre = stylePreferencesPreamble(stylePreferences);
  const mem = memoryReferencePreamble(memoryReferenceLines);
  const tpl = templateExecutionPreamble(templateExecutionContext);
  const core = safe.length > 1200 ? `${safe.slice(0, 1200)}…` : safe;
  return [
    pre || null,
    mem || null,
    tpl || null,
    "请根据以上上下文与下列任务描述，生成可直接使用的内容产出（结构清晰，可使用小标题与列表）。",
    "",
    core
  ]
    .filter((x): x is string => Boolean(x))
    .join("\n");
}

/** G-1：`generate` 经统一 Core AI Router */
async function runGenerateViaAiRouter(
  prompt: string,
  stylePreferences?: StylePreferencesSnapshot,
  memoryReferenceLines?: string[],
  templateExecutionContext?: TemplateExecutionContext
): Promise<ContentExecutionResult> {
  const routerPrompt = buildGeneratePromptForRouter(
    prompt,
    stylePreferences,
    memoryReferenceLines,
    templateExecutionContext
  );
  const ai = await invokeAiContentOnCore({ action: "generate", prompt: routerPrompt });
  return {
    type: "content",
    action: "generate",
    title: ai.title,
    body: ai.body,
    summary: ai.summary,
    stepCount: 1,
    resultSource: ai.resultSource,
    metadata: {
      mode: "ai_router",
      aiOutcome: ai.aiOutcome,
      ...(stylePreferences && Object.keys(stylePreferences).length ? { stylePreferences } : {})
    }
  };
}

/**
 * 统一 Content 执行入口（Session 只调用此函数，不得在 Session 内拼文案）。
 */
export async function executeContentAction(input: ContentExecutionInput): Promise<ContentExecutionResult> {
  const action = asContentAction(input.planStep.contentAction ?? input.action);
  if (!action) {
    throw new Error(`unsupported_content_action:${String(input.planStep.contentAction)}`);
  }

  switch (action) {
    case "generate":
      return runGenerateViaAiRouter(
        input.prompt,
        input.stylePreferences,
        input.memoryReferenceLines,
        input.templateExecutionContext
      );
    case "summarize_result":
      return summarizeFromPriorResultsAndEvents(input.previousResults, input.computerEvents, input.prompt);
  }
}
