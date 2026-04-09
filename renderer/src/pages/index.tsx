import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toUserFacingErrorMessage } from "../services/userFacingErrorMessage";
import { executionEngine } from "../execution/execution.engine";
import { useExecutionState } from "../execution/execution.state";
import { executionApi } from "../services/execution.api";
import { createTask, mapCreateTaskResponseToExecutionTask } from "../services/tasks.api";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Textarea } from "../components/ui/Textarea";
import { useUiStrings } from "../i18n/useUiStrings";
import {
  formatPlannerSourceForUi,
  formatResultVmKindForUi,
  formatStepStatusForUi,
  formatTaskStatusForUi
} from "../i18n/formatExecutionUi";
import { hasTemplateSavedForSource } from "../services/templateService";
import {
  mapExecutionStepsToStepVMs,
  mapExecutionTaskResultToResultVM,
  mapExecutionTaskToTaskVM,
  serializeExecutionLogsForDisplay
} from "../viewmodels";
import type { ExecutionTask } from "../execution/execution.types";

export { LoginPage } from "./LoginPage";
export { RegisterPage } from "./RegisterPage";
export { VerifyEmailPage } from "./VerifyEmailPage";
export { ForgotPasswordPage } from "./ForgotPasswordPage";
export { ResetPasswordPage } from "./ResetPasswordPage";
export { AppWorkbench as WorkbenchPage } from "../components/layout/AppWorkbench";
export { ToolHubPage } from "./ToolHubPage";
export { ToolsPage } from "./ToolsPage";
export { AccountPage } from "./AccountPage";
export { MemoryPage } from "./MemoryPage";

export const NewTaskPage = () => {
  const u = useUiStrings();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [materials, setMaterials] = useState("");
  const setCurrentTask = useExecutionState((s) => s.setCurrentTask);
  const setCurrentLogs = useExecutionState((s) => s.setCurrentLogs);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="page-stack">
      <header className="page-header">
        <h1 className="page-title">{u.newTask.title}</h1>
        <p className="page-lead">{u.newTask.lead}</p>
      </header>
      <Card title={u.newTask.card}>
        <div className="form-field">
          <label className="form-label" htmlFor="nt-prompt">
            {u.newTask.promptLabel}
          </label>
          <Input
            id="nt-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={u.newTask.promptPh}
            autoComplete="off"
          />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="nt-materials">
            {u.newTask.materialsLabel}
          </label>
          <Textarea
            id="nt-materials"
            value={materials}
            onChange={(e) => setMaterials(e.target.value)}
            placeholder={u.newTask.materialsPh}
          />
        </div>
        <Button
          disabled={running}
          onClick={() => {
            const inputData = {
              oneLinePrompt: prompt,
              importedMaterials: materials
                .split("\n")
                .map((x) => x.trim())
                .filter(Boolean)
            };
            setRunning(true);
            setError("");
            createTask(inputData)
              .then(async (res) => {
                const task = mapCreateTaskResponseToExecutionTask(inputData, res);
                setCurrentTask(task);
                try {
                  const detail = await executionApi.fetchExecutionTaskDetail(task.id);
                  setCurrentLogs(Array.isArray(detail.logs) ? detail.logs : []);
                } catch {
                  setCurrentLogs([]);
                }
                navigate("/workbench");
              })
              .catch((e: unknown) => {
                if (import.meta.env.DEV) console.error("[NewTaskPage] createTask", e);
                setError(toUserFacingErrorMessage(e));
              })
              .finally(() => setRunning(false));
          }}
        >
          {running ? u.newTask.running : u.newTask.submit}
        </Button>
        {running ? <p className="text-muted">{u.newTask.runningHint}</p> : null}
        {error ? (
          <p className="text-danger text-pre-wrap" role="alert">
            {u.newTask.errPrefix}：{error}
          </p>
        ) : null}
      </Card>
    </div>
  );
};

export const ResultPage = () => {
  const u = useUiStrings();
  const location = useLocation();
  const task = useExecutionState((s) => s.currentTask);
  const currentLogs = useExecutionState((s) => s.currentLogs);
  const addPersistenceAlert = useExecutionState((s) => s.addPersistenceAlert);
  const [replayMode, setReplayMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const setCurrentTask = useExecutionState((s) => s.setCurrentTask);
  const setCurrentLogs = useExecutionState((s) => s.setCurrentLogs);

  const taskVm = useMemo(() => (task ? mapExecutionTaskToTaskVM(task) : null), [task]);
  const resultPackVm = useMemo(() => (task ? mapExecutionTaskResultToResultVM(task) : null), [task]);
  const stepVms = useMemo(() => mapExecutionStepsToStepVMs(task?.steps), [task?.steps]);
  const logsDisplay = useMemo(() => serializeExecutionLogsForDisplay(currentLogs), [currentLogs]);

  const templateSavedForTask = useMemo(
    () => Boolean(task?.id && hasTemplateSavedForSource(task.id)),
    [task?.id, location.pathname, location.key]
  );

  const replay = async () => {
    if (!task) return;
    setLoading(true);
    setError("");
    try {
      const detail = await executionApi.fetchExecutionTaskDetail(task.id);
      setCurrentTask({ ...detail.task, steps: detail.steps });
      setCurrentLogs(Array.isArray(detail.logs) ? detail.logs : []);
      setReplayMode(true);
    } catch (e: unknown) {
      if (import.meta.env.DEV) console.error("[ResultPage] replay", e);
      setError(toUserFacingErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const rerun = async () => {
    if (!task) return;
    setReplayMode(false);
    setLoading(true);
    setError("");
    try {
      const rerunResult = await executionApi.rerunExecutionTask(task.id);
      const detail = await executionApi.fetchExecutionTaskDetail(rerunResult.taskId);
      setCurrentTask({ ...detail.task, steps: detail.steps });
      setCurrentLogs(Array.isArray(detail.logs) ? detail.logs : []);
    } catch {
      const rerunTask = await executionEngine.execute(task.input, (nextTask) => setCurrentTask(nextTask), {
        sourceTaskId: task.id,
        runType: "rerun",
        onPersistenceAlert: addPersistenceAlert
      });
      setCurrentTask(rerunTask);
      setError(u.result.rerunFallback);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-stack">
      <header className="page-header">
        <h1 className="page-title">{u.result.title}</h1>
        <p className="page-lead">{u.result.lead}</p>
      </header>
      {!task ? (
        <Card title={u.result.cardState}>
          <p className="auto-placeholder">{u.result.noTask}</p>
        </Card>
      ) : (
        <>
          <Card title={u.result.summary}>
            <div className="text-muted">
              {u.result.planner}：{formatPlannerSourceForUi(u, taskVm?.plannerSource)}
            </div>
            <div className="text-muted">
              {u.result.taskStatus}：{formatTaskStatusForUi(u, taskVm?.status)}
            </div>
            <div className="text-muted">
              {u.result.taskOrigin}：
              {taskVm?.runType === "rerun"
                ? `${u.result.originRerun} ${taskVm?.sourceTaskId ?? ""}`
                : u.result.originNew}
            </div>
            <div className="page-row">
              <Button variant="primary" onClick={rerun} disabled={!task || loading}>
                {u.result.rerun}
              </Button>
              <Button variant="secondary" onClick={replay} disabled={!task || loading}>
                {u.result.replay}
              </Button>
            </div>
            {templateSavedForTask ? (
              <p className="text-muted text-sm mt-2">{u.result.templateSavedFromTask}</p>
            ) : null}
          </Card>
          <Card title={replayMode ? u.result.chainReplay : u.result.chainLive}>
            <div className="step-list">
              {stepVms.map((step) => (
                <div key={step.id} className="step-item">
                  <strong>
                    {step.order}. {step.title}
                  </strong>
                  <div className="text-muted">
                    {u.workbench.stepStatus}：{formatStepStatusForUi(u, step.status)}
                  </div>
                  <div className="text-muted">
                    {u.workbench.stepLatency}：{step.latencyMs} ms
                  </div>
                  <div className="text-muted">
                    {u.result.stepErrLabel}：
                    {step.errorText ? toUserFacingErrorMessage(step.errorText) : u.common.dash}
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card title={u.result.logs}>
            <pre className="mono-block">{logsDisplay}</pre>
          </Card>
          <Card title={u.result.pack}>
            {resultPackVm ? (
              <div className="result-pack-vm">
                <p className="font-medium">{resultPackVm.title}</p>
                <p className="mono-block text-sm mt-2">{resultPackVm.body}</p>
                {resultPackVm.summary ? (
                  <p className="text-muted text-sm mt-2">{resultPackVm.summary}</p>
                ) : null}
                <p className="text-muted text-sm mt-2">
                  {u.result.packSourceLabel}：{resultPackVm.source} · {formatResultVmKindForUi(u, resultPackVm.kind)}
                </p>
              </div>
            ) : (
              <pre className="mono-block">{JSON.stringify(task?.result, null, 2)}</pre>
            )}
          </Card>
        </>
      )}
      {loading ? <p className="text-muted">{u.result.loading}</p> : null}
      {error ? (
        <p className="text-warning">
          {u.result.hintPrefix}：{error}
        </p>
      ) : null}
    </div>
  );
};

export { HistoryPage } from "./HistoryPage";
export { SavedResultsPage } from "./SavedResultsPage";
export { TemplatesPage } from "./TemplatesPage";
export { TemplateDetailPage } from "./TemplateDetailPage";
export { SettingsPage } from "./SettingsPage";
export { AutomationConsolePage } from "./AutomationConsolePage";
