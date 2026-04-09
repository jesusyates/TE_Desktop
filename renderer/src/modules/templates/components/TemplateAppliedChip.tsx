import { Link } from "react-router-dom";
import "../template-library.css";

type Props = {
  displayName: string;
  templateId: string;
  chipLabel: string;
  viewDetailLabel: string;
  showDetailLink: boolean;
  clearLabel: string;
  clearTitle: string;
  onClear: () => void;
  disabled?: boolean;
};

/**
 * H-3：明示「当前使用模板」+ 可跳转详情，避免隐式执行来源。
 */
export const TemplateAppliedChip = ({
  displayName,
  templateId,
  chipLabel,
  viewDetailLabel,
  showDetailLink,
  clearLabel,
  clearTitle,
  onClear,
  disabled = false
}: Props) => {
  const tid = templateId.trim();
  return (
    <div className="template-applied-chip" role="status">
      <span className="template-applied-chip__label">{chipLabel}</span>
      <span className="template-applied-chip__name" title={displayName}>
        {displayName}
      </span>
      {showDetailLink && tid ? (
        <Link className="template-applied-chip__detail" to={`/templates/${encodeURIComponent(tid)}`}>
          {viewDetailLabel}
        </Link>
      ) : null}
      <button
        type="button"
        className="template-applied-chip__clear"
        onClick={onClear}
        disabled={disabled}
        title={clearTitle}
      >
        {clearLabel}
      </button>
    </div>
  );
};
