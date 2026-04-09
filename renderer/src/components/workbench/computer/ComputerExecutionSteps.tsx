import type { ComputerExecutionStepView } from "../../../types/computerExecution";
import "./computer-execution.css";

type Props = {
  steps: ComputerExecutionStepView[];
};

const STATE_LABEL: Record<ComputerExecutionStepView["state"], string> = {
  pending: "待开始",
  running: "进行中",
  success: "已完成",
  failed: "失败",
  skipped: "已跳过"
};

export const ComputerExecutionSteps = ({ steps }: Props) => {
  return (
    <section className="computer-execution-steps" aria-label="电脑操作步骤">
      <h3 className="computer-execution-steps__title">操作步骤（事件归约）</h3>
      {steps.length === 0 ? (
        <p className="text-muted text-sm">尚无步骤类事件（step.start）。</p>
      ) : (
        <ol className="computer-execution-steps__list">
          {steps.map((s) => (
            <li key={s.id} className={`computer-execution-step computer-execution-step--${s.state}`}>
              <div className="computer-execution-step__head">
                <span className="computer-execution-step__title">{s.title}</span>
                <span className="computer-execution-step__state">{STATE_LABEL[s.state]}</span>
              </div>
              {typeof s.progress === "number" && s.state === "running" ? (
                <div className="computer-execution-step__progress" aria-hidden>
                  <div
                    className="computer-execution-step__progress-bar"
                    style={{ width: `${Math.round(s.progress * 100)}%` }}
                  />
                </div>
              ) : null}
              {s.errorMessage ? (
                <p className="computer-execution-step__desc computer-execution-step__desc--error text-sm">
                  {s.errorMessage}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
