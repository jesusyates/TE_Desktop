import { useState } from "react";
import { useUiStrings } from "../i18n/useUiStrings";
import { Card } from "../components/ui/Card";

import { TotpToolPanel } from "../modules/tools/totp/TotpToolPanel";
import "./tools-page.css";

export const ToolsPage = () => {
  const u = useUiStrings();
  const p = u.toolsPage;
  const [activeId, setActiveId] = useState<string | null>(null);

  const totpOpen = activeId === "totp";

  return (
    <div className="page-stack tools-page">
      <header className="page-header">
        <h1 className="page-title">{p.title}</h1>
        <p className="page-lead text-muted tools-page__intro">{p.lead}</p>
      </header>

      <div className="tools-page__grid">
        <button
          type="button"
          className="tools-page__card"
          data-active={totpOpen}
          onClick={() => setActiveId((id) => (id === "totp" ? null : "totp"))}
        >
          <h2 className="tools-page__card-title">{p.totpCardTitle}</h2>
          <p className="tools-page__card-desc">{p.totpCardDesc}</p>
          <span className="text-sm text-muted mt-2 inline-block">{totpOpen ? p.closeTool : p.openTool}</span>
        </button>
      </div>

      {totpOpen ? (
        <Card title={u.toolsTotp.panelTitle} className="tools-page__panel">
          <TotpToolPanel u={u} />
        </Card>
      ) : null}

      <p className="tools-page__footnote text-muted mb-0">{p.privacyNote}</p>
    </div>
  );
};
