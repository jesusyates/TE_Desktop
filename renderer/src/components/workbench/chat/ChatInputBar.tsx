import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AttachmentList } from "./AttachmentList";
import { PlusButton } from "./PlusButton";
import type { StartTaskPayload, TaskAttachmentMeta } from "../../../types/task";
import type { TaskMode } from "../../../types/taskMode";
import { TemplateAppliedChip } from "../../../modules/templates/components/TemplateAppliedChip";
import { useUiStrings } from "../../../i18n/useUiStrings";
import { toUserFacingExecutionError } from "../../../services/userFacingExecutionMessage";
import "./workbench-chat.css";

function makeAttachmentId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function fileToMeta(file: File): TaskAttachmentMeta {
  return {
    id: makeAttachmentId(),
    name: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream"
  };
}

/** D-4-2：父组件写入的模板来源（仅标记 + submit 透传 templateId） */
export type AppliedTemplateSource = {
  templateId: string;
  displayName: string;
};

export type ChatInputBarProps = {
  prompt: string;
  setPrompt: (v: string) => void;
  onSubmit: (payload: StartTaskPayload) => void;
  /** 禁用模板芯片 / 模式 / 附件钮等「周边」；执行中应为 true，避免中途改上下文 */
  locked: boolean;
  /**
   * 仅禁用多行输入框（replay等只读场景）。**不得**因 `isBusy` / 提交飞行中为 true —与发送门控解耦（P0）。
   */
  disableTextInput: boolean;
  /** 为 true 时禁止发送（空内容、replay、或 **仅** `chatSubmitInFlight` 短窗口）；**不得**含整条任务 `session.isBusy`（P0） */
  submitDisabled: boolean;
  /** 非对话式主按钮文案：仅「提交前置 async」时为 true，非整段 executing */
  submitInFlight?: boolean;
  /** D-7-3S：自热状态恢复首选模式（仅首帧） */
  initialTaskMode?: TaskMode;
  /** D-7-3S：模式变更时持久化 */
  onTaskModeChange?: (mode: TaskMode) => void;
  error?: string;
  /** 模板注入后展示芯片；清除仅去掉来源，不自动清空 prompt */
  appliedTemplate?: AppliedTemplateSource | null;
  onClearAppliedTemplate?: () => void;
  /** D-7-4C：由 URL/模板页注入时同步任务模式（key 变化即应用） */
  templateBootstrap?: { key: number; mode: TaskMode } | null;
  /** 预留：将来由模板恢复的附件，本阶段不参与逻辑 */
  initialAttachments?: TaskAttachmentMeta[];
  /** D-7-5K：仅输入框 + 发送，无模式/附件入口（仍可向会话提交 auto 模式） */
  conversationalInput?: boolean;
  /** H-3：模板芯片是否展示跳转详情 */
  showTemplateDetailLink?: boolean;
};

/**
 * 底部固定任务输入栏：prompt + 附件元数据（D-3-1 无上传）。
 */
export const ChatInputBar = ({
  prompt,
  setPrompt,
  onSubmit,
  locked,
  disableTextInput,
  submitDisabled,
  submitInFlight = false,
  initialTaskMode,
  onTaskModeChange,
  error,
  appliedTemplate = null,
  onClearAppliedTemplate,
  templateBootstrap = null,
  initialAttachments: _initialAttachments,
  conversationalInput = false,
  showTemplateDetailLink = true
}: ChatInputBarProps) => {
  void _initialAttachments;
  const u = useUiStrings();
  const [taskMode, setTaskMode] = useState<TaskMode>(() => initialTaskMode ?? "auto");
  const [attached, setAttached] = useState<TaskAttachmentMeta[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  /** D-7-5Z1：对话模式最大可视高度（px），与 CSS max-height 一致 */
  const convoTextareaMaxPx = 120;

  useLayoutEffect(() => {
    if (!conversationalInput) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const sh = el.scrollHeight;
    el.style.height = `${Math.min(sh, convoTextareaMaxPx)}px`;
    el.style.overflowY = sh > convoTextareaMaxPx ? "auto" : "hidden";
  }, [prompt, conversationalInput, disableTextInput]);

  useEffect(() => {
    if (!templateBootstrap?.key) return;
    setTaskMode(templateBootstrap.mode);
    onTaskModeChange?.(templateBootstrap.mode);
    // 仅响应模板页/URL 注入的 bootstrap，不把 onTaskModeChange 列入依赖以免父级每次 render 重放
  }, [templateBootstrap?.key, templateBootstrap?.mode]);

  const busy = locked;
  /** 发送钮 / Enter：与「周边 chrome 锁定」解耦，避免整条任务 isBusy 灰死按钮 */
  const baseSendable = !submitDisabled && prompt.trim().length > 0;
  const canSend = baseSendable;

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line no-console -- P0 排障：发送门控
    console.debug("[ChatInputBar] send gate", {
      canSend,
      submitDisabled,
      submitInFlight,
      promptEmpty: !prompt.trim(),
      promptLen: prompt.length,
      chromeLocked: locked,
      textareaDisabled: disableTextInput
    });
  }, [disableTextInput, locked, submitDisabled, submitInFlight, canSend, prompt]);

  const addFiles = useCallback((files: File[]) => {
    setAttached((prev) => [...prev, ...files.map(fileToMeta)]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setAttached((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const handleSend = () => {
    if (!canSend) return;
    const tid = appliedTemplate?.templateId.trim();
    onSubmit({
      prompt: prompt.trim(),
      skipIntentPreview: true,
      ...(!conversationalInput && attached.length ? { attachments: [...attached] } : {}),
      requestedMode: taskMode,
      ...(tid ? { templateId: tid } : {})
    });
    if (!conversationalInput) setAttached([]);
    if (tid) onClearAppliedTemplate?.();
  };

  return (
    <div className="workbench-chat__input-dock">
      <div className="chat-input-bar">
        {appliedTemplate ? (
          <TemplateAppliedChip
            displayName={appliedTemplate.displayName}
            templateId={appliedTemplate.templateId}
            chipLabel={u.workbench.templateChipLabel}
            viewDetailLabel={u.workbench.templateViewDetail}
            showDetailLink={showTemplateDetailLink}
            clearLabel={u.workbench.templateChipClear}
            clearTitle={u.workbench.templateChipClearTitle}
            onClear={() => onClearAppliedTemplate?.()}
            disabled={busy}
          />
        ) : null}
        {!conversationalInput ? (
          <>
            <div className="chat-input-bar__attachments">
              <AttachmentList items={attached} onRemove={removeFile} />
            </div>
            <div className="chat-input-bar__mode-row" role="group" aria-label="任务模式">
              {(
                [
                  { id: "auto" as const, label: "Auto" },
                  { id: "content" as const, label: "Content" },
                  { id: "computer" as const, label: "Computer" }
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`chat-input-bar__mode-chip${taskMode === opt.id ? " chat-input-bar__mode-chip--active" : ""}`}
                  disabled={busy}
                  onClick={() => {
                    setTaskMode(opt.id);
                    onTaskModeChange?.(opt.id);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        ) : null}
        <div className={`chat-input-bar__row${conversationalInput ? " chat-input-bar__row--conversational" : ""}`}>
          {conversationalInput ? (
            <PlusButton
              disabled
              onPickFiles={() => {}}
              ariaLabel={u.workbench.attachAria}
              title={u.workbench.attachTitle}
            />
          ) : (
            <PlusButton disabled={busy} onPickFiles={addFiles} ariaLabel="添加本地文件" />
          )}
          <div className="chat-input-bar__textarea-wrap">
            <textarea
              id="workbench-chat-input"
              ref={conversationalInput ? textareaRef : undefined}
              className="chat-input-bar__textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={conversationalInput ? u.workbench.inputPlaceholder : u.console.superInputPh}
              autoComplete="off"
              rows={conversationalInput ? 1 : 2}
              disabled={disableTextInput}
              onKeyDown={(e) => {
                /* D-7-5O：Enter 提交，Shift+Enter 换行；不可发送时不拦截 Enter（P0：执行中仍可换行编辑） */
                if (e.key !== "Enter" || e.shiftKey) return;
                if (!canSend) return;
                e.preventDefault();
                handleSend();
              }}
            />
          </div>
          {conversationalInput ? (
            <button
              type="button"
              className={`chat-input-bar__send-fab${!canSend ? " chat-input-bar__send-fab--disabled" : ""}`}
              disabled={!canSend}
              onClick={handleSend}
              aria-label={u.workbench.sendMessageAria}
            >
              <svg className="chat-input-bar__send-fab-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 19.5V8.5m0 0-4.5 4.5M12 8.5l4.5 4.5"
                />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              className={`ui-btn ui-btn--primary chat-input-bar__send`}
              disabled={!canSend}
              onClick={handleSend}
            >
              {submitInFlight ? u.stage.runBusy : u.console.executionSession.actionStart}
            </button>
          )}
        </div>
        {error ? (
          <p className="text-danger text-pre-wrap text-sm" role="alert">
            {conversationalInput ? "" : `${u.stage.errLabel}：`}
            {conversationalInput ? toUserFacingExecutionError(error, null) : error}
          </p>
        ) : null}
      </div>
    </div>
  );
};
