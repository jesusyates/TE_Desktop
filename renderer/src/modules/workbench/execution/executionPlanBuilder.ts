/**
 * F-1A / F-2A：由分析结果构造 ExecutionPlan（语义多步；F-2A 含 capability → summarize）。
 */
import type { TaskAnalysisResult } from "../analyzer/taskAnalyzerTypes";
import type { ContentCapabilitySpec } from "./capabilityStepTypes";
import {
  getContentCapabilityPlanStepCopy,
  getContentCapabilitySummarizeStepCopy
} from "./contentCapabilityRecognition";
import type { ExecutionPlan, ExecutionPlanStep } from "./executionPlanTypes";
import {
  lrLocalFileOpTitle,
  lrSemanticsSuffix,
  lrStepDescription,
  lrStepGroupTitle
} from "./localRuntimeNomenclature.zh";

function genStep(
  index: number,
  title: string,
  description: string,
  extraInput?: Record<string, unknown>
): ExecutionPlanStep {
  return {
    stepId: `step_${index}`,
    type: "generate",
    title,
    description,
    status: "pending",
    input: { phase: index, ...extraInput },
    output: null
  };
}

function summarizeStep(index: number, title: string, description: string): ExecutionPlanStep {
  return {
    stepId: `step_${index}`,
    type: "summarize",
    title,
    description,
    status: "pending",
    input: { phase: index },
    output: null
  };
}

function capabilityStep(
  index: number,
  title: string,
  description: string,
  spec: ContentCapabilitySpec
): ExecutionPlanStep {
  return {
    stepId: `step_${index}`,
    type: "capability",
    title,
    description,
    status: "pending",
    input: {
      capabilityType: spec.capabilityType,
      operation: spec.operation,
      payload: { source: "user_prompt" }
    },
    output: null
  };
}

/** F-2A / F-2B：本地内容 capability → 摘要（文案与识别模块一致） */
function buildContentCapabilityPipeline(analysis: TaskAnalysisResult): ExecutionPlanStep[] {
  const spec = analysis.metadata?.contentCapability;
  if (!spec) {
    return buildContentPipeline(analysis);
  }
  const planCopy = getContentCapabilityPlanStepCopy(spec);
  const sumCopy = getContentCapabilitySummarizeStepCopy();
  return finalizeStepIds([
    capabilityStep(0, planCopy.title, planCopy.description, spec),
    summarizeStep(1, sumCopy.title, sumCopy.description)
  ]);
}

/** 内容类：语义两段 — 完整生成 → 基于前序产出的摘要/压缩/交付整理 */
function buildContentPipeline(_analysis: TaskAnalysisResult): ExecutionPlanStep[] {
  return finalizeStepIds([
    genStep(
      0,
      "任务理解与内容生成",
      "根据用户指令完成结构化内容产出：目标澄清、关键要点、主体论述与可选的发布/使用建议（单段完整产出，供下一步压缩整理）。"
    ),
    summarizeStep(
      1,
      "摘要与交付整理",
      "基于上一步完整产出进行摘要、压缩与结构化整理：短摘要、要点清单与可对外引用的精简版（禁止当作新主题扩写）。"
    )
  ]);
}

/** 整理类：行动草案生成 → 可执行清单式摘要整理 */
function buildOrganizePipeline(_analysis: TaskAnalysisResult): ExecutionPlanStep[] {
  return finalizeStepIds([
    genStep(
      0,
      "整理分析与行动草案",
      "归纳整理范围、路径偏好与不可触碰项，给出文件夹结构、命名规则与分批整理的行动草案（单段完整建议）。"
    ),
    summarizeStep(
      1,
      "可执行清单摘要",
      "将上一步草案压缩为核对清单式摘要：分批顺序、风险提示与关键检查项，便于用户手动执行。"
    )
  ]);
}

function finalizeStepIds(steps: ExecutionPlanStep[]): ExecutionPlanStep[] {
  return steps.map((s, i) => ({
    ...s,
    stepId: `step_${i}`
  }));
}

function inferLocalTextRuleFromPrompt(raw: string): string {
  if (/去重|删重|重复行|dedupe/i.test(raw)) return "dedupe_lines";
  if (/空行|去掉空|strip/i.test(raw)) return "strip_empty_lines";
  if (/排序/i.test(raw)) return "sort_lines";
  return "trim_lines";
}

function localScanStep(index: number): ExecutionPlanStep {
  return {
    stepId: `step_${index}`,
    type: "local_scan",
    title: lrStepGroupTitle("local_scan"),
    description: lrStepDescription("local_scan"),
    status: "pending",
    input: {},
    output: null
  };
}

function localReadTextFileStep(index: number): ExecutionPlanStep {
  return {
    stepId: `step_${index}`,
    type: "local_read",
    title: lrStepGroupTitle("local_read"),
    description: lrStepDescription("local_read"),
    status: "pending",
    input: {},
    output: null
  };
}

function localTextTransformStep(index: number, analysis: TaskAnalysisResult): ExecutionPlanStep {
  const rule = inferLocalTextRuleFromPrompt(analysis.rawPrompt);
  return {
    stepId: `step_${index}`,
    type: "local_text_transform",
    title: lrStepGroupTitle("local_text_transform"),
    description: lrStepDescription("local_text_transform", rule),
    status: "pending",
    input: { text: analysis.rawPrompt, rule },
    output: null
  };
}

function humanConfirmLocalSafeStep(index: number, humanMessage: string): ExecutionPlanStep {
  return {
    stepId: `step_${index}`,
    type: "human_confirm",
    title: "本地安全执行确认",
    description: humanMessage,
    status: "pending",
    input: {},
    output: null,
    humanMessage
  };
}

function localSafeFileOperationStep(index: number, input: Record<string, unknown>): ExecutionPlanStep {
  const safeOp = typeof input.safeOp === "string" ? input.safeOp : "";
  return {
    stepId: `step_${index}`,
    type: "local_file_operation",
    title: lrLocalFileOpTitle(safeOp),
    description: `主进程弹出系统对话框选择目录，变更前将再次确认。${lrSemanticsSuffix()}。`,
    status: "pending",
    input,
    output: null,
    metadata: { localSafeV1: true }
  };
}

export function buildExecutionPlanFromAnalysis(
  analysis: TaskAnalysisResult,
  taskId: string,
  planId = "plan_local"
): ExecutionPlan {
  const classifyTransfer =
    analysis.metadata?.localTransferMode === "copy" ? "复制（保留原文件）" : "移动";
  const steps =
    analysis.intent === "local_directory_scan"
      ? finalizeStepIds([localScanStep(0)])
      : analysis.intent === "local_text_file_read"
        ? finalizeStepIds([localReadTextFileStep(0)])
        : analysis.intent === "local_text_transform"
          ? finalizeStepIds([localTextTransformStep(0, analysis)])
          : analysis.intent === "local_safe_rename"
            ? finalizeStepIds([
                humanConfirmLocalSafeStep(
                  0,
                  "将在您选择的目录内，仅对顶层文件批量重命名（去除文件名中的空格等）。不进入子文件夹、不联网、不上传数据；在系统对话框中仍会展示待执行清单并需再次确认。"
                ),
                localSafeFileOperationStep(1, { safeOp: "rename_strip_spaces" })
              ])
            : analysis.intent === "local_safe_classify"
              ? finalizeStepIds([
                  humanConfirmLocalSafeStep(
                    0,
                    `将打开文件夹选择框；对其中顶层文件按扩展名归入 Images / Docs / Sheets / Archives / Others 子文件夹，模式：${classifyTransfer}。不处理子文件夹、不联网、不上传；执行前系统会列出计划并再次确认。`
                  ),
                  localSafeFileOperationStep(1, {
                    safeOp: "classify_by_extension",
                    transferMode: analysis.metadata?.localTransferMode === "copy" ? "copy" : "move"
                  })
                ])
              : analysis.intent === "organize_files"
                ? buildOrganizePipeline(analysis)
                : analysis.intent === "content_capability"
                  ? buildContentCapabilityPipeline(analysis)
                  : buildContentPipeline(analysis);
  return {
    planId,
    taskId,
    status: "pending",
    steps
  };
}
