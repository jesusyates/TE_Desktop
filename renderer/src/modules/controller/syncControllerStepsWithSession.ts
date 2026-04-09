import type { ExecutionPhase, ExecutionStatus } from "../../execution/session/execution";
import type { ControllerPlanV1, ControllerStepStatus } from "./controllerTypes";

export type SyncControllerSessionOpts = {
  phase?: ExecutionPhase | null;
  currentStepIndex?: number;
  executionPlanStepCount?: number;
};

/**
 * 将会话状态机映射到 Controller 步骤展示态（可解释、非黑盒）。
 * 若提供 executionPlanStepCount / currentStepIndex，则在 running 族状态下按 Core 执行步进度对齐（细于纯 status）。
 * error / stopped 不将未执行步骤标为 success（避免「假完成」观感）。
 */
export function syncControllerStepsWithSession(
  plan: ControllerPlanV1,
  status: ExecutionStatus,
  opts?: SyncControllerSessionOpts | null
): ControllerPlanV1 {
  const steps = plan.steps.map((s) => ({ ...s }));
  const n = steps.length;
  if (n === 0) return plan;

  const setAll = (st: ControllerStepStatus) => {
    for (let i = 0; i < n; i++) steps[i].status = st;
  };

  if (status === "idle") {
    return { ...plan, steps };
  }

  const execN = opts?.executionPlanStepCount ?? 0;
  const useExecRefinement =
    opts != null &&
    execN > 0 &&
    (status === "running" || status === "paused" || status === "stopping") &&
    opts.currentStepIndex != null;

  if (status === "validating") {
    steps[0].status = "running";
    for (let i = 1; i < n; i++) steps[i].status = "pending";
    return { ...plan, steps };
  }

  if (status === "queued") {
    if (opts?.phase === "preparing" && n >= 2) {
      steps[0].status = "success";
      steps[1].status = "running";
      for (let i = 2; i < n; i++) steps[i].status = "pending";
      return { ...plan, steps };
    }
    steps[0].status = "running";
    for (let i = 1; i < n; i++) steps[i].status = "pending";
    return { ...plan, steps };
  }

  if (useExecRefinement) {
    const idx = Math.max(0, opts!.currentStepIndex!);
    const num = idx + 1;
    const p = Math.min(1, num / execN);
    const boundary = p * (n - 1);
    const runningIdx = Math.min(n - 1, Math.max(0, Math.ceil(boundary) - 1));
    for (let i = 0; i < runningIdx; i++) steps[i].status = "success";
    steps[runningIdx].status = "running";
    for (let i = runningIdx + 1; i < n; i++) steps[i].status = "pending";
    return { ...plan, steps };
  }

  if (status === "running" || status === "paused" || status === "stopping") {
    if (n === 2) {
      steps[0].status = "success";
      steps[1].status = "running";
    } else {
      for (let i = 0; i < n - 2; i++) steps[i].status = "success";
      steps[n - 2].status = "running";
      steps[n - 1].status = "pending";
    }
    return { ...plan, steps };
  }

  if (status === "success") {
    setAll("success");
    return { ...plan, steps };
  }

  if (status === "error" || status === "stopped") {
    const orig = plan.steps;
    const validatingLike =
      orig[0]?.status === "running" && orig.slice(1).every((s) => s.status === "pending");
    if (validatingLike) {
      steps[0].status = "error";
      for (let i = 1; i < n; i++) steps[i].status = "pending";
      return { ...plan, steps };
    }
    if (n === 2) {
      steps[0].status = "success";
      steps[1].status = "error";
      return { ...plan, steps };
    }
    const w = n - 2;
    for (let i = 0; i < w; i++) steps[i].status = "success";
    steps[w].status = "error";
    for (let i = w + 1; i < n; i++) steps[i].status = "pending";
    return { ...plan, steps };
  }

  return { ...plan, steps };
}
