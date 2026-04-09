import type { ComputerExecutionView } from "../../../types/computerExecution";
import "./computer-execution.css";

type Props = {
  view: ComputerExecutionView;
};

export const ComputerExecutionStatus = ({ view }: Props) => {
  return (
    <section className="computer-execution-status" aria-label="电脑执行状态">
      <div className="computer-execution-status__row">
        <span className="computer-execution-status__label">运行状态</span>
        <strong className="computer-execution-status__headline">{view.currentStatus}</strong>
      </div>
      <div className="computer-execution-status__row computer-execution-status__row--secondary">
        <span className="computer-execution-status__label">时间线</span>
        <span className="computer-execution-status__phase">{view.timelinePhaseLabel}</span>
      </div>
      {view.currentStatusDetail ? (
        <p className="computer-execution-status__hint text-muted text-sm">{view.currentStatusDetail}</p>
      ) : null}
      {view.currentStepId ? (
        <p className="computer-execution-status__current-step text-sm">
          当前步骤 ID：<span className="mono-block">{view.currentStepId}</span>
        </p>
      ) : null}
    </section>
  );
};
