import type { Template } from "../types/template";
import "../template-library.css";

type Props = {
  template: Template;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  /** D-4-2：注入 ChatInputBar，不直接 createTask */
  onUseForNewTask: (template: Template) => void;
};

function taskIdTail(id: string): string {
  const t = id.trim();
  if (t.length <= 8) return t || "—";
  return t.slice(-8);
}

function formatCreated(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export const TemplateLibraryItem = ({ template, selected, onSelect, onRemove, onUseForNewTask }: Props) => {
  return (
    <li
      className={`template-library-item${selected ? " template-library-item--selected" : ""}`}
    >
      <button type="button" className="template-library-item__main" onClick={onSelect}>
        <span className="template-library-item__name">{template.name}</span>
        {template.category?.trim() ? (
          <span className="template-library-item__category">{template.category.trim()}</span>
        ) : null}
        <span className="template-library-item__meta">
          来源任务 <span className="mono-block">{taskIdTail(template.sourceTaskId)}</span>
        </span>
        <span className="template-library-item__meta">{formatCreated(template.createdAt)}</span>
      </button>
      <button
        type="button"
        className="template-library-item__use"
        title="用此模板新建任务"
        onClick={(e) => {
          e.stopPropagation();
          onUseForNewTask(template);
        }}
      >
        新建
      </button>
      <button
        type="button"
        className="template-library-item__remove"
        title="删除"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        ×
      </button>
    </li>
  );
};
