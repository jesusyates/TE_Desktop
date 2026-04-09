import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useUiStrings } from "../../i18n/useUiStrings";
import { useAuthStore } from "../../store/authStore";
import { getMyPreferences, updateMyPreferences } from "../../services/preferencesApi";
import { Button } from "../ui/Button";
import { ToolRequestEntry } from "../tool/ToolRequestEntry";
import { ContextDebugBanner } from "../ContextDebugBanner";
import type { ScannedTool } from "../../types/desktopRuntime";
import {
  PREF_LOCALE_IDS,
  PREF_MARKET_IDS,
  formatPrefLocale,
  formatPrefMarket,
  getUiLangMode
} from "../../i18n/preferenceLabels";

type Props = {
  open: boolean;
  onClose: () => void;
  scannedTools: ScannedTool[];
  onRescan: () => void;
};

export const AuxiliaryDrawer = ({ open, onClose, scannedTools, onRescan }: Props) => {
  const u = useUiStrings();
  const authLocale = useAuthStore((s) => s.locale);
  const drawerUiMode = getUiLangMode(authLocale);
  const [prefMarket, setPrefMarket] = useState("global");
  const [prefLocale, setPrefLocale] = useState("en-US");
  const [prefBusy, setPrefBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    getMyPreferences()
      .then((p) => {
        setPrefMarket(p.market);
        setPrefLocale(p.locale);
      })
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="aux-drawer__backdrop"
        aria-label={u.stage.closed}
        onClick={onClose}
      />
      <aside className="aux-drawer" role="dialog" aria-modal="true" aria-labelledby="aux-drawer-title">
        <div className="aux-drawer__head">
          <h2 id="aux-drawer-title">{u.stage.drawerTitle}</h2>
          <button type="button" className="aux-drawer__close" onClick={onClose}>
            {u.stage.closed}
          </button>
        </div>
        <p className="aux-drawer__intro text-muted text-sm">{u.stage.drawerIntro}</p>

        <div className="aux-drawer__section">
          <h3 className="aux-drawer__sub">{u.stage.recentHeading}</h3>
          <p className="text-muted text-sm mb-2">{u.quickAccess.drawerHistoryHint}</p>
          <Link to="/history" className="aux-drawer__link" onClick={onClose}>
            {u.stage.fullHistory}
          </Link>
        </div>

        <div className="aux-drawer__section">
          <h3 className="aux-drawer__sub">{u.stage.prefsHeading}</h3>
          <div className="aux-drawer__prefs-row">
            <select
              className="ui-select"
              value={prefMarket}
              onChange={(e) => setPrefMarket(e.target.value)}
              aria-label={u.settings.countryRegion}
            >
              {PREF_MARKET_IDS.map((m) => (
                <option key={m} value={m}>
                  {formatPrefMarket(m, drawerUiMode)}
                </option>
              ))}
            </select>
            <select
              className="ui-select"
              value={prefLocale}
              onChange={(e) => setPrefLocale(e.target.value)}
              aria-label={u.settings.languageLabel}
            >
              {PREF_LOCALE_IDS.map((l) => (
                <option key={l} value={l}>
                  {formatPrefLocale(l, drawerUiMode)}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="secondary"
            type="button"
            disabled={prefBusy}
            onClick={() => {
              setPrefBusy(true);
              void updateMyPreferences(prefMarket, prefLocale)
                .catch(() => undefined)
                .finally(() => setPrefBusy(false));
            }}
          >
            {prefBusy ? u.stage.prefsSaving : u.stage.prefsSave}
          </Button>
        </div>

        <div className="aux-drawer__section">
          <div className="aux-drawer__scan-head">
            <h3 className="aux-drawer__sub">{u.stage.scannedHeading}</h3>
            <Button variant="ghost" type="button" onClick={onRescan}>
              {u.stage.rescan}
            </Button>
          </div>
          {scannedTools.length === 0 ? (
            <p className="text-muted text-sm">{u.stage.scannedEmpty}</p>
          ) : (
            <ul className="aux-drawer__list text-sm">
              {scannedTools.map((t) => (
                <li key={t.tool_id}>
                  {t.display_name}
                  <span className="text-muted"> — {t.capabilities.join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="aux-drawer__section">
          <ToolRequestEntry />
        </div>

        {import.meta.env.AICS_DEBUG_CONTEXT === "1" ? (
          <div className="aux-drawer__section aux-drawer__debug">
            <ContextDebugBanner />
          </div>
        ) : null}

        <div className="aux-drawer__foot">
          <Link to="/templates" onClick={onClose}>
            {u.nav.templates}
          </Link>
          <Link to="/automation" onClick={onClose}>
            {u.nav.automation}
          </Link>
        </div>
      </aside>
    </>
  );
};
