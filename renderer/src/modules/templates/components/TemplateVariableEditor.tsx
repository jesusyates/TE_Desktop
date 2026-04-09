import type { TemplateVariable, TemplateVariableType } from "../types/template";
import "../template-library.css";

const TYPES: TemplateVariableType[] = ["text", "textarea", "number", "select"];

function newRowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type Props = {
  variables: TemplateVariable[];
  onChange: (next: TemplateVariable[]) => void;
};

/**
 * D-4-4：模板变量列表编辑（不涉及 ChatInputBar）。
 */
export const TemplateVariableEditor = ({ variables, onChange }: Props) => {
  const updateAt = (index: number, part: Partial<TemplateVariable>) => {
    onChange(variables.map((x, i) => (i === index ? { ...x, ...part } : x)));
  };

  const removeAt = (index: number) => {
    onChange(variables.filter((_, i) => i !== index));
  };

  const addRow = () => {
    const n = variables.length + 1;
    onChange([
      ...variables,
      {
        id: newRowId(),
        key: `var_${n}`,
        label: `参数 ${n}`,
        type: "text",
        required: false,
        defaultValue: "",
        placeholder: ""
      }
    ]);
  };

  const duplicateKeys = (() => {
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const v of variables) {
      const k = v.key.trim();
      if (!k) continue;
      if (seen.has(k)) dups.add(k);
      seen.add(k);
    }
    return dups;
  })();

  return (
    <div className="template-variable-editor">
      {duplicateKeys.size > 0 ? (
        <p className="template-variable-editor__warn text-sm">
          存在重复的 key：{[...duplicateKeys].join(", ")}，请保证与 `{"{{key}}"}` 一致且唯一。
        </p>
      ) : null}
      {variables.length === 0 ? (
        <p className="text-muted text-sm">暂无变量。可「新增变量」或从 Prompt 扫描 `{"{{key}}"}`。</p>
      ) : null}
      {variables.map((row, i) => (
        <div key={row.id} className="template-variable-editor__row">
          <div className="template-variable-editor__grid">
            <label className="template-variable-editor__field">
              <span className="template-variable-editor__label">key</span>
              <input
                className="template-variable-editor__input"
                value={row.key}
                onChange={(e) => updateAt(i, { key: e.target.value })}
                placeholder="对应 {{key}}"
                spellCheck={false}
              />
            </label>
            <label className="template-variable-editor__field">
              <span className="template-variable-editor__label">标签</span>
              <input
                className="template-variable-editor__input"
                value={row.label}
                onChange={(e) => updateAt(i, { label: e.target.value })}
              />
            </label>
            <label className="template-variable-editor__field">
              <span className="template-variable-editor__label">类型</span>
              <select
                className="template-variable-editor__select"
                value={row.type}
                onChange={(e) => {
                  const nextType = e.target.value as TemplateVariableType;
                  if (nextType === "select") {
                    updateAt(i, { type: nextType });
                  } else {
                    updateAt(i, { type: nextType, options: undefined });
                  }
                }}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="template-variable-editor__field template-variable-editor__field--check">
              <input
                type="checkbox"
                checked={Boolean(row.required)}
                onChange={(e) => updateAt(i, { required: e.target.checked })}
              />
              <span>必填</span>
            </label>
            <label className="template-variable-editor__field">
              <span className="template-variable-editor__label">默认值</span>
              <input
                className="template-variable-editor__input"
                value={row.defaultValue ?? ""}
                onChange={(e) => updateAt(i, { defaultValue: e.target.value })}
              />
            </label>
            <label className="template-variable-editor__field">
              <span className="template-variable-editor__label">占位提示</span>
              <input
                className="template-variable-editor__input"
                value={row.placeholder ?? ""}
                onChange={(e) => updateAt(i, { placeholder: e.target.value })}
              />
            </label>
            {row.type === "select" ? (
              <label className="template-variable-editor__field template-variable-editor__field--wide">
                <span className="template-variable-editor__label">选项（逗号分隔）</span>
                <input
                  className="template-variable-editor__input"
                  value={(row.options ?? []).join(", ")}
                  onChange={(e) =>
                    updateAt(i, {
                      options: e.target.value
                        .split(/[,，]/)
                        .map((s) => s.trim())
                        .filter(Boolean)
                    })
                  }
                />
              </label>
            ) : null}
          </div>
          <button type="button" className="template-variable-editor__remove" onClick={() => removeAt(i)}>
            删除
          </button>
        </div>
      ))}
      <button type="button" className="template-variable-editor__add" onClick={addRow}>
        新增变量
      </button>
    </div>
  );
};
