import { apiClient } from "./apiClient";
import { normalizeV1ResponseBody } from "./v1Envelope";
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

/** Desktop 执行态 → v1 task 四类状态 */
function toCanonTaskStatus(s: TaskStatus): string {
  if (s === "running") return "running";
  if (s === "failed" || s === "cancelled") return "failed";
  if (s === "success" || s === "partial_success") return "completed";
  return "pending";
}

/** v1 → 执行引擎态（最小可跑） */
function toExecutionTaskStatus(raw: string): TaskStatus {
  const t = String(raw || "").toLowerCase();
  if (t === "running") return "running";
  if (t === "failed") return "failed";
  if (t === "completed") return "success";
  if (t === "pending") return "ready";
  return "pending";
}

function coerceExecutionStep(raw: Record<string, unknown>, orderFallback: number): ExecutionStep {
  return {
    id: String(raw.id ?? ""),
    title: String(raw.title ?? ""),
    order: typeof raw.order === "number" ? raw.order : orderFallback,
    action: (raw.action as ExecutionStep["action"]) || "call-api",
    status: (raw.status as StepStatus) || "pending",
    input: (raw.input && typeof raw.input === "object" ? raw.input : {}) as Record<string, unknown>,
    output: raw.output && typeof raw.output === "object" ? (raw.output as Record<string, unknown>) : undefined,
    error: raw.error != null ? String(raw.error) : undefined,
    errorType: raw.errorType as ErrorType | undefined,
    latency: typeof raw.latency === "number" ? raw.latency : 0
  };
}

function mapV1ItemToExecutionDetail(item: Record<string, unknown>): ExecutionTaskDetailDTO {
  const stepsRaw = Array.isArray(item.steps) ? item.steps : [];
  const steps: ExecutionStep[] = stepsRaw.map((s, i) =>
    s && typeof s === "object" ? coerceExecutionStep(s as Record<string, unknown>, i) : coerceExecutionStep({}, i)
  );
  const logsRaw = Array.isArray(item.logs) ? item.logs : [];
  const logs = logsRaw.filter((x) => x && typeof x === "object") as ExecutionLog[];

  const input =
    item.input && typeof item.input === "object"
      ? (item.input as TaskInput)
      : {
          oneLinePrompt: String(item.oneLinePrompt ?? item.title ?? ""),
          importedMaterials: Array.isArray(item.importedMaterials) ? (item.importedMaterials as string[]) : []
        };

  const task: ExecutionTask = {
    id: String(item.id ?? ""),
    prompt: String(item.title ?? item.oneLinePrompt ?? ""),
    input,
    sourceTaskId: item.sourceTaskId != null ? String(item.sourceTaskId) : undefined,
    runType: item.runType === "rerun" ? "rerun" : "new",
    status: toExecutionTaskStatus(String(item.status ?? "")),
    plannerSource: (item.plannerSource as PlannerSource) || "remote",
    steps,
    result: item.result != null && typeof item.result === "object" ? (item.result as ExecutionTask["result"]) : undefined,
    lastErrorSummary: item.lastErrorSummary != null ? String(item.lastErrorSummary) : undefined,
    createdAt: String(item.createdAt ?? new Date().toISOString()),
    updatedAt: item.updatedAt != null ? String(item.updatedAt) : undefined
  };

  return { task, steps, logs };
}

export const executionApi = {
  async createExecutionTask(payload: CreateExecutionTaskRequestDTO) {
    const body = {
      id: payload.taskId,
      title: payload.prompt,
      oneLinePrompt: payload.prompt,
      input: payload.input,
      plannerSource: payload.plannerSource,
      sourceTaskId: payload.sourceTaskId,
      runType: payload.runType ?? "new",
      status: toCanonTaskStatus(payload.status)
    };
    const { data: raw } = await apiClient.post<unknown>("/v1/tasks", body);
    normalizeV1ResponseBody(raw);
  },

  async updateExecutionTaskStatus(taskId: string, status: TaskStatus, result?: unknown, lastErrorSummary?: string) {
    const { data: raw } = await apiClient.patch<unknown>(`/v1/tasks/${encodeURIComponent(taskId)}`, {
      status: toCanonTaskStatus(status),
      result,
      lastErrorSummary
    });
    normalizeV1ResponseBody(raw);
  },

  async upsertExecutionStep(payload: UpsertExecutionStepRequestDTO) {
    const { data: raw } = await apiClient.patch<unknown>(`/v1/tasks/${encodeURIComponent(payload.taskId)}`, {
      upsertStep: {
        stepId: payload.stepId,
        stepOrder: payload.stepOrder,
        title: payload.title,
        actionName: payload.actionName,
        status: payload.status,
        input: payload.input,
        output: payload.output,
        error: payload.error,
        errorType: payload.errorType,
        latency: payload.latency
      }
    });
    normalizeV1ResponseBody(raw);
  },

  async appendExecutionLog(payload: AppendExecutionLogRequestDTO) {
    const { data: raw } = await apiClient.patch<unknown>(`/v1/tasks/${encodeURIComponent(payload.taskId)}`, {
      appendLog: {
        stepId: payload.stepId,
        level: payload.level,
        status: payload.status,
        input: payload.input,
        output: payload.output,
        error: payload.error,
        errorType: payload.errorType,
        latency: payload.latency
      }
    });
    normalizeV1ResponseBody(raw);
  },

  async fetchExecutionTaskDetail(taskId: string): Promise<ExecutionTaskDetailDTO> {
    const { data: raw } = await apiClient.get<unknown>(`/v1/tasks/${encodeURIComponent(taskId)}`);
    const inner = normalizeV1ResponseBody(raw) as { item?: Record<string, unknown> };
    const item = inner && typeof inner.item === "object" ? inner.item! : null;
    if (!item) throw new Error("task_detail_invalid");
    return mapV1ItemToExecutionDetail(item);
  },

  async rerunExecutionTask(taskId: string): Promise<{ taskId: string }> {
    const { data: raw } = await apiClient.post<unknown>(`/v1/tasks/${encodeURIComponent(taskId)}/rerun`, {});
    const inner = normalizeV1ResponseBody(raw) as { item?: { id?: string } };
    const id = inner?.item && inner.item.id != null ? String(inner.item.id) : "";
    if (!id) throw new Error("rerun_invalid");
    return { taskId: id };
  }
};
