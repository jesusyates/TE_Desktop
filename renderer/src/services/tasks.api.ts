import { ExecutionTask } from "../execution/execution.types";
import { TaskInput } from "../types/task";
import { apiClient } from "./apiClient";

export type CreateTaskBody = TaskInput;

export type CreateTaskResponse = {
  id: string;
  status: string;
  steps: Array<{ id: string; order: number; title: string; status: string; latency: number }>;
  result: { title: string; content: string };
};

/** GET /aics/execution/tasks/:id — 与 shared-core-backend 对齐 */
export type TaskSnapshotTask = {
  id: string;
  status: string;
  result?: unknown;
  lastErrorSummary?: string | null;
  prompt?: string;
};
export type TaskSnapshotResponse = {
  task: TaskSnapshotTask & { steps?: unknown[] };
  steps: unknown[];
  logs: unknown[];
};

export async function createTask(body: CreateTaskBody): Promise<CreateTaskResponse> {
  const res = await apiClient.post<CreateTaskResponse>("/api/tasks", body);
  return res.data;
}

export async function fetchTaskSnapshot(taskId: string): Promise<TaskSnapshotResponse> {
  const res = await apiClient.get<TaskSnapshotResponse>(`/aics/execution/tasks/${taskId}`);
  return res.data;
}

/** GET /aics/execution/tasks — 列表（内存任务，按服务端排序） */
export type ExecutionTaskListItem = {
  id: string;
  status: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
};

function normalizeExecutionTaskListRow(row: unknown): ExecutionTaskListItem | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const id = String(o.id ?? "").trim();
  if (!id) return null;
  const input = o.input && typeof o.input === "object" ? (o.input as Record<string, unknown>) : {};
  const prompt = String(o.prompt ?? input.oneLinePrompt ?? "").trim();
  return {
    id,
    status: String(o.status ?? ""),
    prompt,
    createdAt: String(o.createdAt ?? ""),
    updatedAt: String(o.updatedAt ?? "")
  };
}

export async function fetchExecutionTaskList(): Promise<ExecutionTaskListItem[]> {
  const res = await apiClient.get<unknown[]>("/aics/execution/tasks");
  const raw = Array.isArray(res.data) ? res.data : [];
  const out: ExecutionTaskListItem[] = [];
  for (const item of raw) {
    const n = normalizeExecutionTaskListRow(item);
    if (n) out.push(n);
  }
  return out;
}

export async function pauseTask(taskId: string): Promise<void> {
  await apiClient.post(`/aics/execution/tasks/${taskId}/pause`, {});
}

export async function resumeTask(taskId: string): Promise<void> {
  await apiClient.post(`/aics/execution/tasks/${taskId}/resume`, {});
}

export async function cancelTask(taskId: string): Promise<void> {
  await apiClient.post(`/aics/execution/tasks/${taskId}/cancel`, {});
}

export function mapCreateTaskResponseToExecutionTask(input: TaskInput, api: CreateTaskResponse): ExecutionTask {
  const ts = new Date().toISOString();
  return {
    id: api.id,
    prompt: input.oneLinePrompt,
    input,
    status: api.status as ExecutionTask["status"],
    plannerSource: "remote",
    steps: api.steps.map((s) => ({
      id: s.id,
      title: s.title,
      order: s.order,
      action: "call-api",
      status: s.status as ExecutionTask["steps"][number]["status"],
      input: {},
      latency: s.latency
    })),
    result: {
      title: api.result.title,
      hook: "",
      contentStructure: "",
      body: api.result.content,
      copywriting: "",
      tags: [],
      publishSuggestion: ""
    },
    createdAt: ts,
    updatedAt: ts
  };
}
