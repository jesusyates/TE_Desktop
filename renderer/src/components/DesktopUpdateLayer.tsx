import { useEffect, useRef, useState } from "react";
import { useUiStrings } from "../i18n/useUiStrings";
import { SHARED_CORE_BASE_URL } from "../config/runtimeEndpoints";
import { Button } from "./ui/Button";
import "./desktop-update-layer.css";

type SoftPayload = {
  targetVersion: string;
  message: string | null;
  releaseNotes: string | null;
};

type ForcePayload = {
  targetVersion: string;
  message: string | null;
  downloadUrl: string | null;
};

/**
 * AICS 更新策略：默认无感（silent）；soft 仅一条 toast；force 全屏阻断。
 * 检查节奏与 soft 去重由主进程 enforce（启动一次 + 每 6h，同版本 soft 仅一次）。
 */
export const DesktopUpdateLayer = () => {
  const u = useUiStrings();
  const notifiedRef = useRef(false);
  const [soft, setSoft] = useState<SoftPayload | null>(null);
  const [force, setForce] = useState<ForcePayload | null>(null);

  useEffect(() => {
    const api = window.desktopUpdate;
    if (!api) return;

    const offSoft = api.onSoftPrompt((raw) => {
      const p = raw as SoftPayload;
      const v = (p?.targetVersion || "").trim();
      if (!v) return;
      setSoft({
        targetVersion: v,
        message: p?.message ?? null,
        releaseNotes: p?.releaseNotes ?? null
      });
    });

    const offForce = api.onForceGate((raw) => {
      const p = raw as ForcePayload;
      setForce({
        targetVersion: (p?.targetVersion || "").trim(),
        message: p?.message ?? null,
        downloadUrl: p?.downloadUrl ?? null
      });
    });

    if (!notifiedRef.current) {
      notifiedRef.current = true;
      void api.notifyRendererReady({ coreBaseUrl: SHARED_CORE_BASE_URL });
    }

    return () => {
      offSoft();
      offForce();
    };
  }, []);

  useEffect(() => {
    if (!soft) return;
    const t = window.setTimeout(() => setSoft(null), 6500);
    return () => window.clearTimeout(t);
  }, [soft]);

  if (!window.desktopUpdate) return null;

  return (
    <>
      {soft ? (
        <div className="desktop-update-toast" role="status" aria-live="polite">
          <strong className="block">{u.settings.updatesSoftTitle(soft.targetVersion)}</strong>
          {soft.message ? <p className="mb-0 mt-2 text-muted">{soft.message}</p> : null}
          {!soft.message ? <p className="mb-0 mt-2 text-muted">{u.settings.updatesSoftHint}</p> : null}
        </div>
      ) : null}

      {force ? (
        <div
          className="desktop-update-force-root"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="desktop-update-force-title"
        >
          <div className="desktop-update-force-card">
            <h2 id="desktop-update-force-title" className="page-title text-lg mt-0">
              {u.settings.updatesForceTitle}
            </h2>
            <p className="text-muted mb-2">{force.message?.trim() || u.settings.updatesForceLead}</p>
            {force.targetVersion ? (
              <p className="mono-block text-sm mb-0">
                {u.settings.updatesForceVersion}: {force.targetVersion}
              </p>
            ) : null}
            <div className="desktop-update-force-actions">
              {force.downloadUrl ? (
                <Button
                  variant="primary"
                  type="button"
                  onClick={() => void window.desktopUpdate?.openExternal(force.downloadUrl!)}
                >
                  {u.settings.updatesForceDownload}
                </Button>
              ) : null}
              <Button variant="secondary" type="button" onClick={() => void window.desktopUpdate?.quitApp()}>
                {u.settings.updatesForceQuit}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
