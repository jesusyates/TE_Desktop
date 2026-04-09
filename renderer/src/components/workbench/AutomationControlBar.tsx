import { useState } from "react";
import { useUiStrings } from "../../i18n/useUiStrings";
import { formatTaskStatusForUi } from "../../i18n/formatExecutionUi";
import { useExecutionState } from "../../execution/execution.state";
import { executionApi } from "../../services/execution.api";
import { executionEngine } from "../../execution/execution.engine";
import { Button } from "../ui/Button";
import type { ExecutionTask } from "../../execution/execution.types";

function canOperateRun(task: ExecutionTask | undefined): boolean {
  if (!task) return false;
  return ["running", "planning", "ready", "pending"].includes(task.status);
}

export const AutomationControlBar = () => {
  const u = useUiStrings();
  const task = useExecutionState((s) => s.currentTask);
  const setOperatorPaused = useExecutionState((s) => s.setOperatorPaused);
  const operatorPaused = useExecutionState((s) => s.operatorPaused);
  const setCurrentTask = useExecutionState((s) => s.setCurrentTask);
  const setCurrentLogs = useExecutionState((s) => s.setCurrentLogs);
  const addPersistenceAlert = useExecutionState((s) => s.addPersistenceAlert);
  const [busy, setBusy] = useState(false);

  const active = canOperateRun(task);
  const stopEnabled = active && !busy;
  const pauseEnabled = active && !busy;
  const canRetry =
    Boolean(task) &&
    !busy &&
    task != null &&
    ["success", "failed", "partial_success", "cancelled"].includes(task.status);

  const onStop = async () => {
    if (!task || !stopEnabled) return;
    setBusy(true);
    try {
      await executionApi.updateExecutionTaskStatus(task.id, "cancelled");
    } catch {
      /* 任务可能仅存在于远端 createTask，本地 execution 存储无记录 */
    }
    setCurrentTask({ ...task, status: "cancelled" });
    setOperatorPaused(false);
    setBusy(false);
  };

  const onRetry = async () => {
    if (!task) return;
    setBusy(true);
    try {
      const rerunResult = await executionApi.rerunExecutionTask(task.id);
      const detail = await executionApi.fetchExecutionTaskDetail(rerunResult.taskId);
      setCurrentTask({ ...detail.task, steps: detail.steps });
      setCurrentLogs(Array.isArray(detail.logs) ? detail.logs : []);
    } catch {
      const rerunTask = await executionEngine.execute(task.input, (next) => setCurrentTask(next), {
        sourceTaskId: task.id,
        runType: "rerun",
        onPersistenceAlert: addPersistenceAlert
      });
      setCurrentTask(rerunTask);
    } finally {
      setBusy(false);
    }
  };

  const togglePause = () => {
    if (!pauseEnabled) return;
    setOperatorPaused(!operatorPaused);
  };

  return (
    <section className="automation-control-bar" aria-label={u.console.controlRegion}>
      <div className="automation-control-bar__row">
        <div className="automation-control-bar__status">
          <span className="automation-control-bar__k">{u.workbench.taskStatus}</span>
          <span className="automation-control-bar__v">
            {task
              ? `${formatTaskStatusForUi(u, task.status)}${operatorPaused && active ? ` · ${u.console.pausedLabel}` : ""}`
              : u.console.noActiveTask}
          </span>
          {task ? (
            <span className="automation-control-bar__id mono-block" title={task.id}>
              {task.id.slice(0, 10)}…
            </span>
          ) : null}
        </div>
        <div className="automation-control-bar__actions">
          <Button type="button" variant="secondary" disabled={!pauseEnabled || busy} onClick={togglePause}>
            {operatorPaused && active ? u.console.resume : u.console.pause}
          </Button>
          <Button type="button" variant="secondary" disabled={!stopEnabled || busy} onClick={() => void onStop()}>
            {u.console.stop}
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!canRetry}
            onClick={() => void onRetry()}
            title={u.console.retryHint}
          >
            {u.console.retry}
          </Button>
        </div>
      </div>
    </section>
  );
};
