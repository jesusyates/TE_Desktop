import { ExecutionActionName } from "../execution/execution.types";
import { TaskInput } from "../types/task";

export type PlannedStep = {
  title: string;
  order: number;
  action: ExecutionActionName;
  input: Record<string, unknown>;
};

export type PlannedTask = {
  prompt: string;
  input: TaskInput;
  steps: PlannedStep[];
};

export type PlannerRequestDTO = {
  prompt: string;
  importedMaterials: string[];
  clientContext: {
    platform: "desktop";
    market: "cn";
    version: "1.0.0";
  };
};

export type PlannerResponseDTO = {
  taskId: string;
  steps: Array<{
    title: string;
    stepOrder: number;
    action: ExecutionActionName;
    input: Record<string, unknown>;
  }>;
};
