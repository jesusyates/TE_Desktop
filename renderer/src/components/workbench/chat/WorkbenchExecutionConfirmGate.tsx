type Props = {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** 主按钮（高风险多为「继续」，轻确认多为「开始」） */
  confirmLabel?: string;
  cancelLabel?: string;
};

/**
 * 需确认时再展示：未确认前不调用 session.start（从而不触发 /v1/tasks/:id/run）。
 */
export const WorkbenchExecutionConfirmGate = ({
  message,
  onConfirm,
  onCancel,
  busy = false,
  confirmLabel = "开始",
  cancelLabel = "取消"
}: Props) => {
  return (
    <div
      className="workbench-execution-confirm-gate"
      role="region"
      aria-label="执行确认"
      style={{
        padding: "12px 14px",
        borderRadius: "var(--radius-lg, 8px)",
        border: "1px solid var(--border-default, rgba(255,255,255,0.12))",
        background: "var(--surface-card, var(--bg-card))",
        maxWidth: 640
      }}
    >
      <p className="text-primary mb-3" style={{ margin: 0, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
        {message}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="btn btn--primary btn--sm" disabled={busy} onClick={() => onConfirm()}>
          {confirmLabel}
        </button>
        <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={() => onCancel()}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
};
