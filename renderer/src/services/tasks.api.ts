import { ExecutionTask } from "../execution/execution.types";
import { TaskInput } from "../types/task";
import { apiClient } from "./apiClient";
import { normalizeV1ResponseBody } from "./v1Envelope";

export type CreateTaskBody = TaskInput;

export type CreateTaskResponse = {
  id: string;
  status: string;
  steps: Array<{ id: string; order: number; title: string; status: string; latency: number }>;
  result: { title: string; content: string };
};

/** GET /v1/tasks/:id — 域任务快照（与 execution 内存任务不同源时步骤为空）。 */
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

function mapV1TaskItemToCreateResponse(item: Record<string, unknown>, input: CreateTaskBody): CreateTaskResponse {
  const prompt = String(input.oneLinePrompt ?? item.title ?? "").trim();
  return {
    id: String(item.id ?? ""),
    status: String(item.status ?? "draft"),
    steps: [],
    result: {
      title: String(item.title ?? "任务").trim() || "任务",
      content: prompt
    }
  };
}

export async function createTask(body: CreateTaskBody): Promise<CreateTaskResponse> {
  const { data: raw } = await apiClient.post<unknown>("/v1/tasks", body);
  const inner = normalizeV1ResponseBody(raw) as Record<string, unknown> | null;
  const item = inner && typeof inner === "object" && inner.item && typeof inner.item === "object" ? inner.item : null;
  if (!item || typeof item !== "object") {
    throw new Error("create_task_invalid_response");
  }
  return mapV1TaskItemToCreateResponse(item as Record<string, unknown>, body);
}

export async function fetchTaskSnapshot(taskId: string): Promise<TaskSnapshotResponse> {
  const { data: raw } = await apiClient.get<unknown>(`/v1/tasks/${encodeURIComponent(taskId)}`);
  const inner = normalizeV1ResponseBody(raw) as Record<string, unknown> | null;
  const item =
    inner && typeof inner === "object" && inner.item && typeof inner.item === "object"
      ? (inner.item as Record<string, unknown>)
      : null;
  if (!item) {
    throw new Error("task_snapshot_invalid");
  }
  const prompt = String(item.title ?? (item as { prompt?: string }).prompt ?? "").trim();
  const steps = Array.isArray(item.steps) ? item.steps : [];
  const logs = Array.isArray(item.logs) ? item.logs : [];
  const task: TaskSnapshotTask = {
    id: String(item.id ?? taskId),
    status: String(item.status ?? ""),
    prompt,
    result: item.result,
    lastErrorSummary: item.lastErrorSummary != null ? String(item.lastErrorSummary) : null
  };
  return { task: { ...task, steps }, steps, logs };
}

/** GET /v1/tasks — 域任务列表 */
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
  const prompt = String(o.prompt ?? o.title ?? input.oneLinePrompt ?? "").trim();
  return {
    id,
    status: String(o.status ?? ""),
    prompt,
    createdAt: String(o.createdAt ?? o.created_at ?? ""),
    updatedAt: String(o.updatedAt ?? o.updated_at ?? "")
  };
}

export async function fetchExecutionTaskList(): Promise<ExecutionTaskListItem[]> {
  const { data: raw } = await apiClient.get<unknown>("/v1/tasks");
  const inner = normalizeV1ResponseBody(raw) as Record<string, unknown> | null;
  const itemsRaw =
    inner && typeof inner === "object" && Array.isArray(inner.items) ? inner.items : [];
  const out: ExecutionTaskListItem[] = [];
  for (const item of itemsRaw) {
    const n = normalizeExecutionTaskListRow(item);
    if (n) out.push(n);
  }
  return out;
}

function v1TaskStatusToExecution(status: string): ExecutionTask["status"] {
  const s = String(status || "").toLowerCase();
  if (s === "running") return "running";
  if (s === "failed") return "failed";
  if (s === "completed") return "success";
  return "ready";
}

export function mapCreateTaskResponseToExecutionTask(input: TaskInput, api: CreateTaskResponse): ExecutionTask {
  const ts = new Date().toISOString();
  return {
    id: api.id,
    prompt: input.oneLinePrompt,
    input,
    status: v1TaskStatusToExecution(api.status),
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
