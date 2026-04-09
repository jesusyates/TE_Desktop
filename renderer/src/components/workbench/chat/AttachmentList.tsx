import type { TaskAttachmentMeta } from "../../../types/task";

type Props = {
  items: TaskAttachmentMeta[];
  onRemove: (id: string) => void;
};

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export const AttachmentList = ({ items, onRemove }: Props) => {
  if (items.length === 0) return null;

  return (
    <div className="attachment-list" aria-label="已添加附件">
      {items.map((a) => (
        <div key={a.id} className="attachment-chip">
          <span className="attachment-chip__name" title={a.name}>
            {a.name}
          </span>
          <span className="attachment-chip__meta text-muted">{formatSize(a.size)}</span>
          <button
            type="button"
            className="attachment-chip__remove"
            aria-label={`移除 ${a.name}`}
            onClick={() => onRemove(a.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
