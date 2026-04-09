import { useEffect, useState } from "react";
import { useUiStrings } from "../../i18n/useUiStrings";
import { getAicsDesktop } from "../../services/desktopBridge";
import type { CapabilityCatalogEntry } from "../../types/desktopRuntime";
import { createToolRequest } from "../../services/toolRequestApi";
import { toUserFacingErrorMessage } from "../../services/userFacingErrorMessage";
import { apiClient } from "../../services/apiClient";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Textarea } from "../ui/Textarea";

type EntryProps = {
  /** 提交成功后回调（例如 Tool Hub 刷新列表） */
  onSubmitted?: () => void;
};

export const ToolRequestEntry = ({ onSubmitted }: EntryProps) => {
  const u = useUiStrings();
  const locale = useAuthStore((s) => s.locale);
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<CapabilityCatalogEntry[]>([]);
  const [toolName, setToolName] = useState("");
  const [toolType, setToolType] = useState("");
  const [purpose, setPurpose] = useState("");
  const [website, setWebsite] = useState("");
  const [screenshotNote, setScreenshotNote] = useState("");
  const [capability, setCapability] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    const loc = locale || "en-US";
    const b = getAicsDesktop();
    if (b) {
      void b.getCapabilityCatalog(loc).then((c) => setCatalog(c as CapabilityCatalogEntry[]));
      return;
    }
    void apiClient
      .get<{ items: CapabilityCatalogEntry[] }>("/aics/capability-catalog", { params: { locale: loc } })
      .then((r) => setCatalog(r.data.items ?? []))
      .catch(() => setCatalog([]));
  }, [open, locale]);

  const submit = () => {
    setBusy(true);
    setErr("");
    setMsg("");
    createToolRequest({
      tool_name: toolName.trim(),
      tool_type: toolType.trim(),
      purpose: purpose.trim(),
      website_url: website.trim(),
      screenshot_note: screenshotNote.trim(),
      capability: capability.trim()
    })
      .then(() => {
        setMsg(u.console.requestCreated);
        setToolName("");
        setToolType("");
        setPurpose("");
        setWebsite("");
        setScreenshotNote("");
        setCapability("");
        onSubmitted?.();
      })
      .catch((e: unknown) => {
        if (import.meta.env.DEV) console.error("[ToolRequestEntry] createToolRequest", e);
        setErr(toUserFacingErrorMessage(e));
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="tool-request-entry">
      <Button variant="secondary" type="button" className="tool-request-entry__cta" onClick={() => setOpen(true)}>
        {u.console.toolRequestCta}
      </Button>
      {open ? (
        <div className="tool-request-entry__modal" role="dialog" aria-modal="true" aria-labelledby="tr-title">
          <div className="tool-request-entry__panel">
            <div className="tool-request-entry__head">
              <h2 id="tr-title">{u.console.toolRequestTitle}</h2>
              <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
                ×
              </Button>
            </div>
            <p className="text-muted">{u.console.toolRequestLead}</p>
            <div className="form-field">
              <label className="form-label" htmlFor="tr-name">
                {u.console.fieldToolName}
              </label>
              <Input id="tr-name" value={toolName} onChange={(e) => setToolName(e.target.value)} />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="tr-type">
                {u.console.fieldToolType}
              </label>
              <Input id="tr-type" value={toolType} onChange={(e) => setToolType(e.target.value)} />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="tr-purpose">
                {u.console.fieldPurpose}
              </label>
              <Textarea id="tr-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={3} />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="tr-web">
                {u.console.fieldWebsite}
              </label>
              <Input id="tr-web" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="tr-shot">
                {u.console.fieldScreenshotNote}
              </label>
              <Textarea id="tr-shot" value={screenshotNote} onChange={(e) => setScreenshotNote(e.target.value)} rows={2} />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="tr-cap">
                {u.console.fieldCapability}
              </label>
              <select
                id="tr-cap"
                className="ui-select max-w-md"
                value={capability}
                onChange={(e) => setCapability(e.target.value)}
              >
                <option value="">{u.console.capabilityPlaceholder}</option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="page-row">
              <Button variant="primary" type="button" disabled={busy} onClick={submit}>
                {busy ? u.console.submitBusy : u.console.submitRequest}
              </Button>
            </div>
            {msg ? <p className="text-success">{msg}</p> : null}
            {err ? <p className="text-danger">{err}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};
