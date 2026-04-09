import { plannerService, validatePlannerInput } from "../planner/planner.service";
import { executionApi } from "../services/execution.api";
import { ResultPackage, TaskInput } from "../types/task";
import { ExecutionQueue } from "./execution.queue";
import { classifyExecutionError, executionRunner, shouldRetry } from "./execution.runner";
import { ErrorType, ExecutionError, ExecutionRuntimeOptions, ExecutionStep, ExecutionTask, PersistenceAlert, TaskStatus } from "./execution.types";

const runtimeOptions: ExecutionRuntimeOptions = {
  allowParallel: false,
  retryCount: 1,
  persistenceRetryCount: 1,
  fallbackModel: "gpt-fallback",
  model: "gpt-primary"
};

const outputFilter = (value: string) => value.replace(/(password|token|secret)/gi, "[redacted]");

const toResultPackage = (prompt: string, steps: ExecutionStep[]): ResultPackage => {
  const script = String(steps.find((x) => x.title === "生成脚本")?.output?.script ?? "");
  const title = String(steps.find((x) => x.title === "生成标题")?.output?.title ?? `${prompt} 内容方案`);
  const tags = (steps.find((x) => x.title === "生成标签")?.output?.tags as string[] | undefined) ?? [];
  return {
    title: outputFilter(title),
    hook: "开场 3 秒抓住注意力",
    contentStructure: "问题 -> 方案 -> 示例 -> CTA",
    body: outputFilter(script),
    copywriting: "建议先 A/B 两版封面文案后发布。",
    tags,
    publishSuggestion: "优先晚间高活跃时段发布，并在 2 小时内复盘互动。"
  };
};

export const executionEngine = {
  options: runtimeOptions,
  async execute(
    input: TaskInput,
    onUpdate?: (task: ExecutionTask) => void,
    options?: { sourceTaskId?: string; runType?: "new" | "rerun"; onPersistenceAlert?: (alert: PersistenceAlert) => void }
  ): Promise<ExecutionTask> {
    const safety = validatePlannerInput(input.oneLinePrompt);
    if (!safety.ok) throw new ExecutionError(safety.reason ?? "输入校验失败", "safety_blocked");

    const planningTaskBase: ExecutionTask = {
      id: crypto.randomUUID(),
      prompt: input.oneLinePrompt,
      input,
      sourceTaskId: options?.sourceTaskId,
      runType: options?.runType ?? "new",
      status: "planning",
      plannerSource: "failed",
      createdAt: new Date().toISOString(),
      steps: []
    };
    onUpdate?.(planningTaskBase);

    const plannedResult = await plannerService.planTask(input);
    const task: ExecutionTask = {
      id: planningTaskBase.id,
      prompt: input.oneLinePrompt,
      input,
      status: "ready",
      plannerSource: plannedResult.source,
      createdAt: new Date().toISOString(),
      steps: plannedResult.plan.steps.map((x) => ({
        id: crypto.randomUUID(),
        title: x.title,
        order: x.order,
        action: x.action,
        status: "pending",
        input: x.input,
        latency: 0
      }))
    };
    await persistTask(task, options?.onPersistenceAlert);
    onUpdate?.({ ...task, steps: [...task.steps] });

    const queue = new ExecutionQueue();
    queue.enqueue(task);
    const runningTask = queue.dequeue();
    if (!runningTask) throw new Error("执行队列为空");

    runningTask.status = "running";
    await executionApi.updateExecutionTaskStatus(runningTask.id, "running");
    onUpdate?.({ ...runningTask, steps: [...runningTask.steps] });

    const context: Record<string, unknown> = { prompt: input.oneLinePrompt, materials: input.importedMaterials };
    const failedSteps: ExecutionStep[] = [];

    for (const step of runningTask.steps) {
      const start = performance.now();
      step.status = "running";
      await persistStep(runningTask.id, step, options?.onPersistenceAlert);
      await persistLog(runningTask.id, {
        stepId: step.id,
        level: "info",
        status: step.status,
        input: step.input,
        latency: 0
      }, options?.onPersistenceAlert);
      onUpdate?.({ ...runningTask, steps: [...runningTask.steps] });

      let lastError = "";
      let lastErrorType: ErrorType | undefined;
      for (let i = 0; i <= runtimeOptions.retryCount; i += 1) {
        try {
          const output = await executionRunner.runAction(step.action, step.input, context);
          step.output = output;
          step.status = "success";
          Object.assign(context, output);
          lastError = "";
          lastErrorType = undefined;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error.message : "unknown error";
          lastErrorType = classifyExecutionError(error);
          if (!shouldRetry(lastErrorType, step.action)) break;
        }
      }

      step.latency = Math.round(performance.now() - start);
      if (lastError) {
        step.status = "failed";
        step.error = lastError;
        step.errorType = lastErrorType;
        failedSteps.push(step);
        await persistStep(runningTask.id, step, options?.onPersistenceAlert);
        await persistLog(runningTask.id, {
          stepId: step.id,
          level: "error",
          status: step.status,
          error: step.error,
          errorType: step.errorType,
          latency: step.latency
        }, options?.onPersistenceAlert);
      } else {
        await persistStep(runningTask.id, step, options?.onPersistenceAlert);
        await persistLog(runningTask.id, {
          stepId: step.id,
          level: "info",
          status: step.status,
          output: step.output,
          latency: step.latency
        }, options?.onPersistenceAlert);
      }

      onUpdate?.({ ...runningTask, steps: [...runningTask.steps] });
    }

    runningTask.result = toResultPackage(input.oneLinePrompt, runningTask.steps);
    runningTask.status = deriveTaskStatus(runningTask.steps);
    runningTask.lastErrorSummary = failedSteps[0]?.error;
    await executionApi.updateExecutionTaskStatus(
      runningTask.id,
      runningTask.status,
      runningTask.result,
      runningTask.lastErrorSummary
    );
    return runningTask;
  }
};

const deriveTaskStatus = (steps: ExecutionStep[]): TaskStatus => {
  const failedCount = steps.filter((x) => x.status === "failed").length;
  if (failedCount === 0) return "success";
  if (failedCount < steps.length) return "partial_success";
  return "failed";
};

const persistTask = async (task: ExecutionTask, onPersistenceAlert?: (alert: PersistenceAlert) => void) => {
  try {
    await executionApi.createExecutionTask({
      taskId: task.id,
      prompt: task.prompt,
      sourceTaskId: task.sourceTaskId,
      runType: task.runType,
      plannerSource: task.plannerSource,
      status: task.status,
      input: task.input
    });
    await executionApi.appendExecutionLog({
      taskId: task.id,
      level: "info",
      status: task.status,
      input: { plannerSource: task.plannerSource, plannerReason: task.plannerReason },
      latency: 0
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "persist task failed";
    onPersistenceAlert?.({
      id: crypto.randomUUID(),
      taskId: task.id,
      entity: "task",
      message,
      retryAttempted: false,
      createdAt: new Date().toISOString()
    });
    throw new ExecutionError(message, "persistence_error");
  }
};

const persistStep = async (taskId: string, step: ExecutionStep, onPersistenceAlert?: (alert: PersistenceAlert) => void) => {
  const payload = {
    taskId,
    stepId: step.id,
    stepOrder: step.order,
    title: step.title,
    actionName: step.action,
    status: step.status,
    input: step.input,
    output: step.output,
    error: step.error,
    errorType: step.errorType,
    latency: step.latency
  };
  await retryPersistence(
    () => executionApi.upsertExecutionStep(payload),
    { taskId, stepId: step.id, entity: "step", onPersistenceAlert },
    runtimeOptions.persistenceRetryCount
  );
};

const persistLog = async (
  taskId: string,
  payload: {
    stepId?: string;
    level: "info" | "warn" | "error";
    status: TaskStatus | ExecutionStep["status"];
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    error?: string;
    errorType?: ErrorType;
    latency: number;
  },
  onPersistenceAlert?: (alert: PersistenceAlert) => void
) => {
  await retryPersistence(
    () =>
      executionApi.appendExecutionLog({
        taskId,
        stepId: payload.stepId,
        level: payload.level,
        status: payload.status,
        input: payload.input,
        output: payload.output,
        error: payload.error,
        errorType: payload.errorType,
        latency: payload.latency
      }),
    { taskId, stepId: payload.stepId, entity: "log", onPersistenceAlert },
    runtimeOptions.persistenceRetryCount
  );
};

const retryPersistence = async (
  run: () => Promise<void>,
  context: {
    taskId: string;
    stepId?: string;
    entity: "step" | "log";
    onPersistenceAlert?: (alert: PersistenceAlert) => void;
  },
  retryCount: number
) => {
  try {
    await run();
  } catch (firstError) {
    try {
      if (retryCount > 0) {
        await run();
        context.onPersistenceAlert?.({
          id: crypto.randomUUID(),
          taskId: context.taskId,
          stepId: context.stepId,
          entity: context.entity,
          message: `${context.entity} 持久化首次失败，重试成功`,
          retryAttempted: true,
          createdAt: new Date().toISOString()
        });
        return;
      }
    } catch (secondError) {
      const message = secondError instanceof Error ? secondError.message : "persistence retry failed";
      context.onPersistenceAlert?.({
        id: crypto.randomUUID(),
        taskId: context.taskId,
        stepId: context.stepId,
        entity: context.entity,
        message,
        retryAttempted: true,
        createdAt: new Date().toISOString()
      });
      throw new ExecutionError(message, "persistence_error");
    }
    const message = firstError instanceof Error ? firstError.message : "persistence failed";
    context.onPersistenceAlert?.({
      id: crypto.randomUUID(),
      taskId: context.taskId,
      stepId: context.stepId,
      entity: context.entity,
      message,
      retryAttempted: true,
      createdAt: new Date().toISOString()
    });
    throw new ExecutionError(message, "persistence_error");
  }
};
