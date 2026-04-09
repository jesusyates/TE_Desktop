import { apiClient } from "./apiClient";
import { ErrorType, ExecutionLog, ExecutionStep, ExecutionTask, PlannerSource, StepStatus, TaskStatus } from "../execution/execution.types";
import { TaskInput } from "../types/task";

export type CreateExecutionTaskRequestDTO = {
  taskId: string;
  prompt: string;
  sourceTaskId?: string;
  runType?: "new" | "rerun";
  plannerSource: PlannerSource;
  status: TaskStatus;
  input: TaskInput;
};

export type UpsertExecutionStepRequestDTO = {
  taskId: string;
  stepId: string;
  stepOrder: number;
  title: string;
  actionName: string;
  status: StepStatus;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  errorType?: ErrorType;
  latency: number;
};

export type AppendExecutionLogRequestDTO = {
  taskId: string;
  stepId?: string;
  level: "info" | "warn" | "error";
  status: TaskStatus | StepStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  errorType?: ErrorType;
  latency: number;
};

type ExecutionTaskDetailDTO = {
  task: ExecutionTask;
  steps: ExecutionStep[];
  logs: ExecutionLog[];
};

export const executionApi = {
  async createExecutionTask(payload: CreateExecutionTaskRequestDTO) {
    await apiClient.post("/aics/execution/tasks", payload);
  },
  async updateExecutionTaskStatus(taskId: string, status: TaskStatus, result?: unknown, lastErrorSummary?: string) {
    await apiClient.patch(`/aics/execution/tasks/${taskId}`, { status, result, lastErrorSummary });
  },
  async upsertExecutionStep(payload: UpsertExecutionStepRequestDTO) {
    await apiClient.put(`/aics/execution/tasks/${payload.taskId}/steps/${payload.stepId}`, payload);
  },
  async appendExecutionLog(payload: AppendExecutionLogRequestDTO) {
    await apiClient.post(`/aics/execution/tasks/${payload.taskId}/logs`, payload);
  },
  async fetchExecutionTaskDetail(taskId: string): Promise<ExecutionTaskDetailDTO> {
    const response = await apiClient.get<ExecutionTaskDetailDTO>(`/aics/execution/tasks/${taskId}`);
    return response.data;
  },
  async rerunExecutionTask(taskId: string): Promise<{ taskId: string }> {
    const response = await apiClient.post<{ taskId: string }>(`/aics/execution/tasks/${taskId}:rerun`);
    return response.data;
  }
};
