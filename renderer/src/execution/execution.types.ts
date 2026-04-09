import { ResultPackage, TaskInput } from "../types/task";

export type TaskStatus =
  | "pending"
  | "planning"
  | "ready"
  | "running"
  | "success"
  | "partial_success"
  | "failed"
  | "cancelled";

export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";

export type LogLevel = "info" | "warn" | "error";

export type ErrorType =
  | "planner_error"
  | "action_validation_error"
  | "action_execution_error"
  | "network_error"
  | "persistence_error"
  | "safety_blocked";

export type PlannerSource = "remote" | "failed";

export type ExecutionActionName =
  | "generate-content"
  | "transform-data"
  | "call-api"
  | "save-memory";

export type ExecutionStep = {
  id: string;
  title: string;
  order: number;
  action: ExecutionActionName;
  status: StepStatus;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  errorType?: ErrorType;
  latency: number;
};

export type ExecutionTask = {
  id: string;
  prompt: string;
  input: TaskInput;
  sourceTaskId?: string;
  runType?: "new" | "rerun";
  status: TaskStatus;
  plannerSource: PlannerSource;
  plannerReason?: string;
  steps: ExecutionStep[];
  result?: ResultPackage;
  lastErrorSummary?: string;
  createdAt: string;
  updatedAt?: string;
};

/** Backend may return minimal step logs `{ stepId, content }` (v0.2); engine append uses the richer shape. */
export type ExecutionLog = {
  id?: string;
  taskId?: string;
  stepId?: string;
  level?: LogLevel;
  status?: TaskStatus | StepStatus;
  errorType?: ErrorType;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  latency?: number;
  createdAt?: string;
  content?: string;
};

export type ExecutionRuntimeOptions = {
  allowParallel: boolean;
  retryCount: number;
  persistenceRetryCount: number;
  fallbackModel: string;
  model: string;
};

export type PersistenceAlert = {
  id: string;
  taskId: string;
  stepId?: string;
  entity: "task" | "step" | "log";
  message: string;
  retryAttempted: boolean;
  createdAt: string;
};

export class ExecutionError extends Error {
  constructor(
    message: string,
    public readonly type: ErrorType
  ) {
    super(message);
    this.name = "ExecutionError";
  }
}
