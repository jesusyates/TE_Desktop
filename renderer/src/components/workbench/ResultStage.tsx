import { useState } from "react";
import { useUiStrings } from "../../i18n/useUiStrings";
import type { ExecutionTask } from "../../execution/execution.types";
import type { ResultPackage } from "../../types/task";
import { Button } from "../ui/Button";
import { executionApi } from "../../services/execution.api";
import { executionEngine } from "../../execution/execution.engine";
import { toUserFacingErrorMessage } from "../../services/userFacingErrorMessage";
import { useExecutionState } from "../../execution/execution.state";

type Props = {
  task: ExecutionTask | null;
  logs: unknown[];
  /** 控制台右侧栏：精简操作与折叠块 */
  variant?: "default" | "sidebar";
};

function asResultPackage(x: unknown): ResultPackage | null {
  if (!x || typeof x !== "object") return null;
  return x as ResultPackage;
}

export const ResultStage = ({ task, logs, variant = "default" }: Props) => {
  const isSidebar = variant === "sidebar";
  const u = useUiStrings();
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState("");
  const [copied, setCopied] = useState(false);
  const [replayMode, setReplayMode] = useState(false);
  const setCurrentTask = useExecutionState((s) => s.setCurrentTask);
  const setCurrentLogs = useExecutionState((s) => s.setCurrentLogs);
  const addPersistenceAlert = useExecutionState((s) => s.addPersistenceAlert);

  const copyAll = async () => {
    if (!task?.result) return;
    const text = JSON.stringify(task.result, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const replay = async () => {
    if (!task) return;
    setLoading(true);
    setHint("");
    try {
      const detail = await executionApi.fetchExecutionTaskDetail(task.id);
      setCurrentTask({ ...detail.task, steps: detail.steps });
      setCurrentLogs(Array.isArray(detail.logs) ? detail.logs : []);
      setReplayMode(true);
    } catch (e: unknown) {
      if (import.meta.env.DEV) console.error("[ResultStage] replay", e);
      setHint(toUserFacingErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const rerun = async () => {
    if (!task) return;
    setReplayMode(false);
    setLoading(true);
    setHint("");
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
      setHint(u.result.rerunFallback);
    } finally {
      setLoading(false);
    }
  };

  const pack = task ? asResultPackage(task.result) : null;
  const structuredPack = Boolean(
    pack &&
      (pack.title ||
        pack.body ||
        pack.hook ||
        pack.copywriting ||
        pack.contentStructure ||
        (pack.tags && pack.tags.length))
  );

  return (
    <section
      className={`result-stage${isSidebar ? " result-stage--sidebar" : ""}`}
      aria-labelledby="result-stage-title"
    >
      <h2 id="result-stage-title" className="result-stage__title">
        {u.stage.resultHeading}
      </h2>
      {!task ? (
        <p className="result-stage__empty">{isSidebar ? u.common.dash : u.stage.resultEmpty}</p>
      ) : !task.result ? (
        <p className="result-stage__partial text-muted">{u.stage.resultPartial}</p>
      ) : !structuredPack ? (
        <div className="result-stage__doc">
          <p className="text-muted text-sm mb-2">{u.stage.rawData}</p>
          <pre className="mono-block result-stage__raw">{JSON.stringify(task.result, null, 2)}</pre>
        </div>
      ) : structuredPack && pack ? (
        <article className="result-stage__doc">
          {pack.title ? (
            <div className="result-stage__block">
              <h3 className="result-stage__doc-title">{pack.title}</h3>
            </div>
          ) : null}
          {pack.hook ? (
            <div className="result-stage__block">
              <span className="result-stage__label">{u.stage.fieldHook}</span>
              <p>{pack.hook}</p>
            </div>
          ) : null}
          {pack.contentStructure ? (
            <div className="result-stage__block">
              <span className="result-stage__label">{u.stage.fieldStructure}</span>
              <p className="result-stage__pre-wrap">{pack.contentStructure}</p>
            </div>
          ) : null}
          {pack.body ? (
            <div className="result-stage__block">
              <span className="result-stage__label">{u.stage.fieldBody}</span>
              <p className="result-stage__pre-wrap">{pack.body}</p>
            </div>
          ) : null}
          {pack.copywriting ? (
            <div className="result-stage__block">
              <span className="result-stage__label">{u.stage.fieldCopy}</span>
              <p className="result-stage__pre-wrap">{pack.copywriting}</p>
            </div>
          ) : null}
          {Array.isArray(pack.tags) && pack.tags.length > 0 ? (
            <div className="result-stage__block">
              <span className="result-stage__label">{u.stage.fieldTags}</span>
              <p>{pack.tags.join(" · ")}</p>
            </div>
          ) : null}
          {pack.publishSuggestion ? (
            <div className="result-stage__block">
              <span className="result-stage__label">{u.stage.fieldPublish}</span>
              <p className="result-stage__pre-wrap">{pack.publishSuggestion}</p>
            </div>
          ) : null}
        </article>
      ) : null}

      {task && !isSidebar ? (
        <div className="result-stage__actions">
          <Button variant="primary" type="button" onClick={rerun} disabled={loading}>
            {u.stage.runAgain}
          </Button>
          <Button variant="secondary" type="button" onClick={replay} disabled={loading}>
            {u.stage.replay}
          </Button>
          <Button variant="ghost" type="button" onClick={copyAll} disabled={!task.result}>
            {copied ? u.stage.copyDone : u.stage.copy}
          </Button>
        </div>
      ) : null}
      {task && isSidebar ? (
        <div className="result-stage__actions result-stage__actions--compact">
          <Button variant="ghost" type="button" onClick={copyAll} disabled={!task.result}>
            {copied ? u.stage.copyDone : u.stage.copy}
          </Button>
        </div>
      ) : null}

      {!isSidebar && replayMode ? (
        <p className="result-stage__hint text-muted text-sm">{u.result.chainReplay}</p>
      ) : null}
      {loading ? <p className="text-muted text-sm">{u.result.loading}</p> : null}
      {hint ? (
        <p className="text-warning text-sm">
          {u.result.hintPrefix}：{hint}
        </p>
      ) : null}

      {!isSidebar && task?.result && structuredPack ? (
        <details className="result-stage__details">
          <summary>{u.stage.rawData}</summary>
          <pre className="mono-block result-stage__raw">{JSON.stringify(task.result, null, 2)}</pre>
        </details>
      ) : null}

      {!isSidebar ? (
        <details className="result-stage__details">
          <summary>{u.stage.techLogs}</summary>
          <pre className="mono-block result-stage__raw">{JSON.stringify(logs, null, 2)}</pre>
        </details>
      ) : null}
    </section>
  );
};
