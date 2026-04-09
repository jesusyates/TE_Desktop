import { useEffect, useState } from "react";
import type { Template, TemplateRunInput } from "../types/template";
import "../template-library.css";

type Props = {
  template: Template;
  onApply: (input: TemplateRunInput) => void;
  onCancel: () => void;
};

/**
 * D-4-4：有变量时先填参，再实例化 prompt 注入工作台（不触 execution）。
 */
export const TemplateRunForm = ({ template, onApply, onCancel }: Props) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init: Record<string, string> = {};
    for (const v of template.variables ?? []) {
      init[v.key] = v.defaultValue ?? "";
    }
    setValues(init);
    setError(null);
  }, [template.id, template.variables]);

  const setVal = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    setError(null);
  };

  const handleApply = () => {
    const merged: Record<string, string> = {};
    for (const v of template.variables ?? []) {
      const raw = (values[v.key] ?? v.defaultValue ?? "").trim();
      if (v.required && raw === "") {
        setError(`请填写：${v.label}（${v.key}）`);
        return;
      }
      if (v.type === "number" && raw !== "" && Number.isNaN(Number(raw))) {
        setError(`「${v.label}」需为数字`);
        return;
      }
      merged[v.key] = raw;
    }
    onApply({ templateId: template.id, values: merged });
  };

  return (
    <div className="template-run-form-overlay" role="dialog" aria-modal="true" aria-label="模板参数">
      <div className="template-run-form">
        <header className="template-run-form__header">
          <h2 className="template-run-form__title">应用模板：{template.name}</h2>
          <p className="template-run-form__hint text-muted text-sm">
            填写参数后将生成最终 prompt 并写入输入栏，不会自动发送任务。
          </p>
        </header>
        <div className="template-run-form__body">
          {(template.variables ?? []).map((v) => (
            <label key={v.id} className="template-run-form__field">
              <span className="template-run-form__label">
                {v.label}
                {v.required ? <span className="template-run-form__req">*</span> : null}
                <span className="template-run-form__key mono-block">{"{{"}{v.key}{"}}"}</span>
              </span>
              {v.type === "textarea" ? (
                <textarea
                  className="template-run-form__textarea"
                  rows={3}
                  value={values[v.key] ?? ""}
                  placeholder={v.placeholder || undefined}
                  onChange={(e) => setVal(v.key, e.target.value)}
                />
              ) : v.type === "select" ? (
                <select
                  className="template-run-form__select"
                  value={values[v.key] ?? ""}
                  onChange={(e) => setVal(v.key, e.target.value)}
                >
                  <option value="">请选择</option>
                  {(v.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="template-run-form__input"
                  type={v.type === "number" ? "number" : "text"}
                  value={values[v.key] ?? ""}
                  placeholder={v.placeholder || undefined}
                  onChange={(e) => setVal(v.key, e.target.value)}
                />
              )}
            </label>
          ))}
          {error ? <p className="template-run-form__error text-sm">{error}</p> : null}
        </div>
        <footer className="template-run-form__footer">
          <button type="button" className="template-run-form__btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="template-run-form__btn-primary" onClick={handleApply}>
            应用模板
          </button>
        </footer>
      </div>
    </div>
  );
};
