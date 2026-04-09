import type { ComputerExecutionEvent } from "../../types/computerExecution";
import type { StylePreferencesSnapshot } from "../../types/stylePreferences";
import type { TaskStep } from "../workbench/planner/taskPlanTypes";
import type { TaskResult } from "../result/resultTypes";
import type { TemplateExecutionContext } from "../workbench/analyzer/taskAnalyzerTypes";

export type ContentActionId = "generate" | "summarize_result";

export interface ContentExecutionInput {
  action: ContentActionId;
  prompt: string;
  planStep: TaskStep;
  /** D-5-10：已完成各步的正式 TaskResult（与 session.stepResults 计划序一致） */
  previousResults?: TaskResult[];
  /** summarize_result 时在无 computer TaskResult 时 fallback */
  computerEvents?: ComputerExecutionEvent[] | null;
  metadata?: Record<string, unknown>;
  /** D-7-5B：来自会话分析上下文的风格偏好（占位生成等可消费） */
  stylePreferences?: StylePreferencesSnapshot;
  /** D-4：分析阶段注入的轻量记忆参考行（有上限，非全文列表） */
  memoryReferenceLines?: string[];
  /** E-3：Core 模板写入的分析元数据，供占位生成拼入上文 */
  templateExecutionContext?: TemplateExecutionContext;
}
