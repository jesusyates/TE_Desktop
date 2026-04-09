import "./trust-gate.css";

type TrustL2ConfirmModalProps = {
  open: boolean;
  message: string;
  continueLabel: string;
  cancelLabel: string;
  onContinue: () => void;
  onCancel: () => void;
};

/**
 * Trust & Data Safety v1：L2 唯一确认层（单弹窗，无额外说明）。
 */
export function TrustL2ConfirmModal({
  open,
  message,
  continueLabel,
  cancelLabel,
  onContinue,
  onCancel
}: TrustL2ConfirmModalProps) {
  if (!open) return null;
  return (
    <div className="trust-gate-dialog" role="dialog" aria-modal="true" aria-labelledby="trust-gate-dialog-title">
      <button type="button" className="trust-gate-dialog__backdrop" aria-label={cancelLabel} onClick={onCancel} />
      <div className="trust-gate-dialog__panel">
        <p id="trust-gate-dialog-title" className="trust-gate-dialog__message">
          {message}
        </p>
        <div className="trust-gate-dialog__actions">
          <button type="button" className="trust-gate-dialog__btn trust-gate-dialog__btn--ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="trust-gate-dialog__btn trust-gate-dialog__btn--primary" onClick={onContinue}>
            {continueLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
