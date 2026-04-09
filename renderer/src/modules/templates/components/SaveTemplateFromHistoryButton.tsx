import { useEffect, useState } from "react";
import { clientSession } from "../../../services/clientSession";
import { useUiStrings } from "../../../i18n/useUiStrings";
import type { TaskHistoryListEntry } from "../../history/types";
import type { SaveTemplateFromTaskInput } from "../types/template";
import "../template-library.css";

type Props = {
  task: TaskHistoryListEntry;
  saveTemplateFromTask: (input: SaveTemplateFromTaskInput) => Promise<string>;
  compact?: boolean;
};

function sourceTaskIdFromHistory(task: TaskHistoryListEntry): string {
  const ex = task.executionTaskId?.trim();
  if (ex) return ex;
  const h = task.historyId?.trim();
  if (h) return h;
  return task.id.trim();
}

function workflowFromHistoryMode(mode?: string): string {
  const m = (mode ?? "").toLowerCase().trim();
  if (m === "computer") return "automation";
  if (m === "content") return "content";
  return "content";
}

function defaultName(prompt: string, task: TaskHistoryListEntry): string {
  const p = prompt.trim();
  if (p.length) return p.length > 36 ? `${p.slice(0, 36)}…` : p;
  const id = sourceTaskIdFromHistory(task);
  return id.length > 10 ? `模板 · ${id.slice(-8)}` : "历史任务模板";
}

/**
 * 从历史记录沉淀模板：最小字段（prompt + 可选 preview），步骤快照为空数组。
 */
export const SaveTemplateFromHistoryButton = ({ task, saveTemplateFromTask, compact }: Props) => {
  const u = useUiStrings();
  const tp = u.templates;
  const hi = u.history;
  const canSave = task.prompt.trim().length > 0;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const openModal = () => {
    if (!canSave) return;
    setName(defaultName(task.prompt, task));
    setDescription((task.preview || "").trim().slice(0, 280));
    setOpen(true);
  };

  const closeModal = () => setOpen(false);

  const onSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    const prompt = task.prompt.trim();
    const workflowType = workflowFromHistoryMode(task.mode);
    const sessionMarket = await clientSession.getMarket();
    const sessionLocale = await clientSession.getLocale();
    const input: SaveTemplateFromTaskInput = {
      name: trimmed,
      description: description.trim() || undefined,
      product: "aics",
      market: sessionMarket,
      locale: sessionLocale,
      version: "1",
      audience: "general",
      workflowType,
      sourceTaskId: sourceTaskIdFromHistory(task),
      sourceRunId: task.coreRunId?.trim() || undefined,
      sourceResultKind: task.status === "success" ? "content" : "none",
      sourcePrompt: prompt,
      stepsSnapshot: [],
      resultSnapshot: {
        title: trimmed,
        bodyPreview: (task.preview || "").trim().slice(0, 800),
        stepCount: 0
      }
    };
    setSaving(true);
    try {
      await saveTemplateFromTask(input);
      setToast({ kind: "ok", text: tp.saveOk });
      closeModal();
    } catch (e) {
      const msg = e instanceof Error ? e.message : tp.saveFail;
      setToast({ kind: "err", text: `${tp.saveFail} ${msg}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={compact ? "task-history-item__save-template text-xs" : "template-save-btn"}
        disabled={!canSave}
        title={hi.saveAsTemplateTitle}
        aria-label={hi.saveAsTemplateAria}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openModal();
        }}
      >
        {tp.saveAsCta}
      </button>
      {open ? (
        <div
          className="template-save-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tpl-hist-save-title"
        >
          <button type="button" className="template-save-dialog__backdrop" aria-label={tp.saveCancel} onClick={closeModal} />
          <div className="template-save-dialog__panel">
            <h2 id="tpl-hist-save-title" className="template-save-dialog__title">
              {hi.saveAsTemplateDialogTitle}
            </h2>
            <p className="text-muted text-sm mb-2">{hi.saveAsTemplateDialogLead}</p>
            <label className="template-save-dialog__field">
              <span>{tp.saveName}</span>
              <input
                type="text"
                className="template-save-dialog__input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </label>
            <label className="template-save-dialog__field">
              <span>{tp.saveDescription}</span>
              <textarea
                className="template-save-dialog__textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </label>
            <div className="template-save-dialog__actions">
              <button
                type="button"
                className="template-save-dialog__btn template-save-dialog__btn--ghost"
                onClick={closeModal}
                disabled={saving}
              >
                {tp.saveCancel}
              </button>
              <button
                type="button"
                className="template-save-dialog__btn template-save-dialog__btn--primary"
                onClick={() => void onSave()}
                disabled={!name.trim() || saving}
              >
                {saving ? tp.saveSubmitting : tp.saveSubmit}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? (
        <div
          className={`template-save-toast template-save-toast--${toast.kind}`}
          role="status"
          aria-live="polite"
        >
          {toast.text}
        </div>
      ) : null}
    </>
  );
};
