import { useMemo, type ReactNode } from "react";
import type { ExecutionPhase, ExecutionStatus } from "../../../execution/session/execution";
import { buildMockComputerEvents } from "../../../modules/computer/lib/buildMockComputerEvents";
import { reduceComputerEvents } from "../../../modules/computer/lib/computerExecutionReducer";
import type { ComputerExecutionEvent } from "../../../types/computerExecution";
import { ComputerExecutionHeader } from "./ComputerExecutionHeader";
import { ComputerExecutionStatus } from "./ComputerExecutionStatus";
import { ComputerExecutionSteps } from "./ComputerExecutionSteps";
import "./computer-execution.css";

type Props = {
  prompt: string;
  status: ExecutionStatus;
  phase: ExecutionPhase | null;
  /** 传入则不走 mock；未来接 agent / stream */
  computerEvents?: ComputerExecutionEvent[] | null;
  children: ReactNode;
  /** D-7-5K：对话式 UI 仅保留底部插槽，不展示步骤/日志面板 */
  embedFooterOnly?: boolean;
};

/**
 * D-5-3A：仅消费 reducer 输出的 ComputerExecutionView；事件来源可插拔。
 */
export const ComputerExecutionPanel = ({
  prompt,
  status,
  phase,
  computerEvents,
  children,
  embedFooterOnly = false
}: Props) => {
  const events = useMemo(() => {
    if (computerEvents != null) {
      return computerEvents;
    }
    return buildMockComputerEvents(prompt, status, phase);
  }, [computerEvents, prompt, status, phase]);

  const view = useMemo(() => reduceComputerEvents(events), [events]);

  const recentLogs = view.logs.slice(-6);

  if (embedFooterOnly) {
    return (
      <div className="computer-execution-panel computer-execution-panel--footer-only">{children}</div>
    );
  }

  return (
    <div className="computer-execution-panel">
      <ComputerExecutionHeader view={view} prompt={prompt} />
      <ComputerExecutionStatus view={view} />
      <ComputerExecutionSteps steps={view.steps} />
      {recentLogs.length > 0 ? (
        <section className="computer-execution-logs" aria-label="执行日志">
          <h3 className="computer-execution-logs__title">事件日志</h3>
          <ul className="computer-execution-logs__list">
            {recentLogs.map((l) => (
              <li key={l.id} className="computer-execution-logs__item">
                <span className="computer-execution-logs__time">{l.timestamp}</span>
                <span className="computer-execution-logs__msg">{l.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {view.screenshots.length > 0 ? (
        <section className="computer-execution-shots" aria-label="截图占位">
          <span className="text-muted text-sm">
            截图占位 {view.screenshots.length}（{view.screenshots[view.screenshots.length - 1].imageUrl}）
          </span>
        </section>
      ) : null}
      <div className="computer-execution-panel__footer">{children}</div>
    </div>
  );
};
