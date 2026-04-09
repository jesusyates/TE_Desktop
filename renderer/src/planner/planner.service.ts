import { apiClient } from "../services/apiClient";
import { ExecutionError } from "../execution/execution.types";
import { PlannedTask, PlannerRequestDTO, PlannerResponseDTO } from "./planner.types";
import { TaskInput } from "../types/task";

const promptInjectionPattern = /(ignore previous|system prompt|越狱|绕过|bypass|jailbreak)/i;

export const validatePlannerInput = (prompt: string): { ok: boolean; reason?: string } => {
  if (!prompt.trim()) return { ok: false, reason: "输入不能为空" };
  if (promptInjectionPattern.test(prompt)) return { ok: false, reason: "输入包含高风险指令片段" };
  return { ok: true };
};

export const plannerService = {
  async planTask(input: TaskInput): Promise<{ plan: PlannedTask; source: "remote" }> {
    const request: PlannerRequestDTO = {
      prompt: input.oneLinePrompt,
      importedMaterials: input.importedMaterials,
      clientContext: { platform: "desktop", market: "cn", version: "1.0.0" }
    };
    try {
      const response = await apiClient.post<PlannerResponseDTO>("/planner/tasks:plan", request);
      return {
        source: "remote",
        plan: {
          prompt: input.oneLinePrompt,
          input,
          steps: response.data.steps.map((x) => ({
            title: x.title,
            order: x.stepOrder,
            action: x.action,
            input: x.input
          }))
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "remote planner failed";
      throw new ExecutionError(`Planner unavailable: ${message}`, "planner_error");
    }
  }
};

export const plannerFailure = (reason: string) => new ExecutionError(reason, "planner_error");
