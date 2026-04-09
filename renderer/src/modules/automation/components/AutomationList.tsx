import type { UiCatalog } from "../../../i18n/uiCatalog";
import type { AutomationRecord } from "../automationTypes";
import { AutomationCard } from "./AutomationCard";

export type AutomationListProps = {
  u: UiCatalog;
  records: AutomationRecord[];
  formatUpdatedAt: (iso: string) => string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
};

export function AutomationList({
  u,
  records,
  formatUpdatedAt,
  selectedId,
  onSelect,
  onDelete
}: AutomationListProps) {
  return (
    <ul className="automation-list" aria-label={u.automation.listAria}>
      {records.map((r) => (
        <AutomationCard
          key={r.id}
          u={u}
          record={r}
          formattedUpdatedAt={formatUpdatedAt(r.updatedAt)}
          selected={r.id === selectedId}
          onOpenDetail={() => onSelect(r.id)}
          onDelete={() => onDelete(r.id)}
        />
      ))}
    </ul>
  );
}
