import { useEffect, useState } from "react";
import { inferTemplateSaveMetadata, type TemplateSaveInferenceContext } from "../../../services/templateMetadataInfer";
import { useUiStrings } from "../../../i18n/useUiStrings";
import { isTaskResult, toTaskResult } from "../../result/resultAdapters";
import { buildTemplateResultSnapshot, cloneStepsSnapshot } from "../lib/snapshot";
import type { SaveTemplateFromTaskInput } from "../types/template";
import "../template-library.css";

type Props = {
  sourceTaskId: string;
  /** D-7-4N：与 session.lastCoreResultRunId 等对齐 */
  sourceRunId?: string | null;
  sourcePrompt: string;
  /** 与当前 session event stream 的 steps 同源 */
  streamSteps: unknown[] | null | undefined;
  streamResult: unknown | null | undefined;
  inferenceContext: TemplateSaveInferenceContext;
  saveTemplateFromTask: (input: SaveTemplateFromTaskInput) => Promise<string>;
  disabled?: boolean;
  /** Result Assetization v1：打开对话框时优先用结果标题 */
  initialNameOverride?: string | null;
  /** 预填描述（如 taskType / structure） */
  initialDescriptionSeed?: string | null;
  buttonClassName?: string;
  ctaLabel?: string;
};

function inferSourceResultKind(streamResult: unknown): "content" | "computer" | "none" {
  const t = isTaskResult(streamResult) ? streamResult : toTaskResult(streamResult);
  if (!t) return "none";
  if (t.kind === "content" || t.kind === "computer") return t.kind;
  return "none";
}

function defaultTemplateName(sourcePrompt: string, sourceTaskId: string): string {
  const p = sourcePrompt.trim();
  if (p.length > 0) return p.length > 32 ? `${p.slice(0, 32)}…` : p;
  const tail = sourceTaskId.trim().slice(-8);
  return tail ? `模板 · ${tail}` : "未命名模板";
}

/**
 * E-2：成功态保存 — POST /templates/save + 本地同 ID 缓存；明确成功/失败反馈。
 */
export const SaveAsTemplateButton = ({
  sourceTaskId,
  sourceRunId,
  sourcePrompt,
  streamSteps,
  streamResult,
  inferenceContext,
  saveTemplateFromTask,
  disabled = false,
  initialNameOverride = null,
  initialDescriptionSeed = null,
  buttonClassName,
  ctaLabel
}: Props) => {
  const u = useUiStrings();
  const busy = !sourceTaskId.trim() || disabled;
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
    if (busy) return;
    const fromResult = initialNameOverride?.trim();
    setName(fromResult || defaultTemplateName(sourcePrompt, sourceTaskId));
    setDescription(initialDescriptionSeed?.trim() || "");
    setOpen(true);
  };

  const closeModal = () => setOpen(false);

  const onSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    const meta = inferTemplateSaveMetadata(inferenceContext);
    const input: SaveTemplateFromTaskInput = {
      name: trimmed,
      description: description.trim() || undefined,
      platform: meta.platform,
      workflowType: meta.workflowType,
      sourceTaskId: sourceTaskId.trim(),
      sourceRunId: sourceRunId?.trim() || undefined,
      sourceResultKind: inferSourceResultKind(streamResult ?? null),
      sourcePrompt,
      stepsSnapshot: cloneStepsSnapshot(streamSteps ?? []),
      resultSnapshot: buildTemplateResultSnapshot(streamResult ?? null)
    };
    setSaving(true);
    try {
      await saveTemplateFromTask(input);
      setToast({ kind: "ok", text: u.templates.saveOk });
      closeModal();
    } catch (e) {
      const msg = e instanceof Error ? e.message : u.templates.saveFail;
      setToast({ kind: "err", text: `${u.templates.saveFail} ${msg}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={buttonClassName?.trim() ? buttonClassName : "template-save-btn"}
        disabled={busy}
        onClick={openModal}
      >
        {ctaLabel?.trim() ? ctaLabel.trim() : u.templates.saveAsCta}
      </button>
      {open ? (
        <div
          className="template-save-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-save-dialog-title"
        >
          <button type="button" className="template-save-dialog__backdrop" aria-label="关闭" onClick={closeModal} />
          <div className="template-save-dialog__panel">
            <h2 id="template-save-dialog-title" className="template-save-dialog__title">
              {u.templates.saveDialogTitle}
            </h2>
            <label className="template-save-dialog__field">
              <span>{u.templates.saveName}</span>
              <input
                type="text"
                className="template-save-dialog__input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </label>
            <label className="template-save-dialog__field">
              <span>{u.templates.saveDescription}</span>
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
                {u.templates.saveCancel}
              </button>
              <button
                type="button"
                className="template-save-dialog__btn template-save-dialog__btn--primary"
                onClick={() => void onSave()}
                disabled={!name.trim() || saving}
              >
                {saving ? u.templates.saveSubmitting : u.templates.saveSubmit}
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
