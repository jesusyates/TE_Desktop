/**
 * 工作台：分析通过后再由用户确认执行（与 session.start / createTask+run 解耦前的文案与可执行性）。
 */

import type { TaskAnalysisResult } from "./analyzer/taskAnalyzerTypes";

export function deriveWorkbenchExecutable(a: TaskAnalysisResult): { ok: boolean; userMessage?: string } {
  if (!a.shouldExecute) {
    return {
      ok: false,
      userMessage: "当前输入无法形成可执行任务。请补充更具体的目标、主题或操作说明，然后再试。"
    };
  }
  return { ok: true };
}

export function buildConfirmAssistantMessageZh(analysis: TaskAnalysisResult, planStepCount: number): string {
  const mode = analysis.resolvedMode === "computer" ? "本地/计算机类" : "内容生成类";
  const n = Math.max(1, planStepCount || 1);
  return `已理解你的需求（${mode}）。准备按约 ${n} 个步骤执行。只有在你点击「开始执行」后才会创建并运行任务。`;
}
