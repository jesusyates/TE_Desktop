import type { ComputerExecutionView } from "../../../types/computerExecution";
import "./computer-execution.css";

type Props = {
  view: ComputerExecutionView;
  prompt: string;
};

export const ComputerExecutionHeader = ({ view, prompt }: Props) => {
  const summary = prompt.trim() || "（无摘要）";
  return (
    <header className="computer-execution-header">
      <div className="computer-execution-header__badge">Computer execution · event-driven</div>
      <div className="computer-execution-target">
        <span className="computer-execution-target__label">目标环境</span>
        <span className="computer-execution-target__value">{view.environmentLabel}</span>
        <span className="computer-execution-target__sep" aria-hidden>
          ·
        </span>
        <span className="computer-execution-target__label">目标应用</span>
        <span className="computer-execution-target__value computer-execution-target__value--app">
          {view.targetApp}
        </span>
      </div>
      <p className="computer-execution-header__summary" title={summary}>
        任务摘要：{summary.length > 160 ? `${summary.slice(0, 160)}…` : summary}
      </p>
      <p className="computer-execution-header__disclaimer text-muted text-sm">
        当前事件流为协议占位 / mock，不接真实操作系统控制。
      </p>
    </header>
  );
};
