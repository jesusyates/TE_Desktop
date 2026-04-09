import { useEffect, useState } from "react";
import { useUiStrings } from "../../i18n/useUiStrings";
import { listCoreAuditEvents } from "../../services/coreAuditService";
import { toUserFacingErrorMessage } from "../../services/userFacingErrorMessage";
import { mapAuditEventDomainToListItemVM, type AuditEventListItemVM } from "../../viewmodels/auditListVm";
import "../../modules/memory/memory-insight-panel.css";

const PREVIEW_LIMIT = 25;

/**
 * D-7-4V：设置页诊断区 — Core 审计列表只读预览（domain → VM，不吃原始 DTO）。
 */
export function SettingsAuditEventsPreview() {
  const u = useUiStrings();
  const [items, setItems] = useState<AuditEventListItemVM[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listCoreAuditEvents(PREVIEW_LIMIT).then((domains) => {
      if (cancelled) return;
      const dash = u.common.dash;
      setItems(domains.map((d) => mapAuditEventDomainToListItemVM(d, dash)));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [u.common.dash]);

  if (loading) {
    return <p className="text-muted text-sm mb-0">{u.settings.auditEventsLoading}</p>;
  }

  if (items.length === 0) {
    return <p className="text-muted text-sm mb-0">{u.settings.auditEventsEmpty}</p>;
  }

  return (
    <ul
      className="memory-insight-panel__list"
      style={{ listStyle: "none", paddingLeft: 0, marginBottom: 0 }}
      aria-label={u.settings.auditEventsCard}
    >
      {items.map((row, i) => (
        <li key={`${row.createdAt}-${row.eventType}-${i}`} className="memory-insight-panel__item text-sm">
          <span className="settings-diag-mono">{row.eventType}</span>
          <span className="memory-insight-panel__muted"> · {row.level}</span>
          <div className="memory-insight-panel__muted mt-1">{toUserFacingErrorMessage(row.reason)}</div>
          <div className="memory-insight-panel__muted text-sm">{row.createdAt}</div>
        </li>
      ))}
    </ul>
  );
}
