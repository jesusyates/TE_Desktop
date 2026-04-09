import { useCallback, useEffect, useState } from "react";
import type { ClarificationQuestion } from "../../services/api";
import "./task-clarification-panel.css";

type TaskClarificationPanelProps = {
  open: boolean;
  title: string;
  confirmLabel: string;
  cancelLabel: string;
  questions: ClarificationQuestion[];
  onConfirm: (answers: Record<string, string>) => void;
  onCancel: () => void;
};

export function TaskClarificationPanel({
  open,
  title,
  confirmLabel,
  cancelLabel,
  questions,
  onConfirm,
  onCancel
}: TaskClarificationPanelProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const init: Record<string, string> = {};
    for (const q of questions) {
      init[q.key] = q.defaultValue ?? q.options[0]?.value ?? "";
    }
    setAnswers(init);
  }, [open, questions]);

  const setAnswer = useCallback((key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm(answers);
  }, [answers, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="task-clarification-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-clarification-title"
    >
      <button type="button" className="task-clarification-dialog__backdrop" aria-label={cancelLabel} onClick={onCancel} />
      <div className="task-clarification-dialog__panel">
        <p id="task-clarification-title" className="task-clarification-dialog__title">
          {title}
        </p>
        {questions.map((q) => (
          <fieldset key={q.key} className="task-clarification-dialog__fieldset">
            <legend className="task-clarification-dialog__legend">{q.label}</legend>
            <div className="task-clarification-dialog__options" role="radiogroup" aria-label={q.label}>
              {q.options.map((opt) => {
                const id = `${q.key}-${opt.value}`;
                return (
                  <label key={opt.value} className="task-clarification-dialog__option" htmlFor={id}>
                    <input
                      id={id}
                      type="radio"
                      name={q.key}
                      value={opt.value}
                      checked={answers[q.key] === opt.value}
                      onChange={() => setAnswer(q.key, opt.value)}
                    />
                    <span>{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
        <div className="task-clarification-dialog__actions">
          <button
            type="button"
            className="task-clarification-dialog__btn task-clarification-dialog__btn--ghost"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="task-clarification-dialog__btn task-clarification-dialog__btn--primary"
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
