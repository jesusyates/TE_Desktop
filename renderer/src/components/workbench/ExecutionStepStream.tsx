import type { ExecutionStep, ExecutionTask } from "../../execution/execution.types";
import { useUiStrings } from "../../i18n/useUiStrings";
import { TaskSteps } from "../task/TaskSteps";

type Props = {
  task: ExecutionTask | null;
  running: boolean;
  /** 适配后的步骤；有值时覆盖 task.steps */
  stepsOverride?: ExecutionStep[] | null;
};

/** 步骤级时间轴（与规划步骤绑定）；Workbench 主路径现用四阶段 ExecutionStage。 */
export const ExecutionStepStream = ({ task, running, stepsOverride }: Props) => {
  const u = useUiStrings();
  const steps = stepsOverride?.length ? stepsOverride : task?.steps ?? [];
  const streamActive = running || task?.status === "running";

  return (
    <section className="execution-step-stream" aria-label={u.console.stepStreamTitle}>
      <h2 className="execution-step-stream__title">{u.console.stepStreamTitle}</h2>
      {steps.length > 0 ? (
        <TaskSteps steps={steps} taskIsRunning={streamActive} />
      ) : (
        <p className="execution-step-stream__idle text-muted text-sm">{u.console.aiIdle}</p>
      )}
    </section>
  );
};
