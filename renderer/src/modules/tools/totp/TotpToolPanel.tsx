import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UiCatalog } from "../../../i18n/uiCatalog";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { parseTotpInput, type ParsedTotpConfig } from "./totpParser";
import { generateTOTP } from "./totpGenerator";
import { currentTimeMs, periodProgress, remainingSecondsInPeriod, timeStepIndex } from "./timeUtils";
import "./totp-tool.css";

export type TotpToolPanelProps = {
  u: UiCatalog;
};

export function TotpToolPanel({ u }: TotpToolPanelProps) {
  const t = u.toolsTotp;
  const [rawInput, setRawInput] = useState("");
  const [timeOffsetSec, setTimeOffsetSec] = useState(0);
  const [currentCode, setCurrentCode] = useState("");
  const [remainingSec, setRemainingSec] = useState(30);
  const [progress, setProgress] = useState(0);
  const [copyToast, setCopyToast] = useState(false);
  const [genError, setGenError] = useState(false);
  const lastStepRef = useRef<number | null>(null);
  const genSeqRef = useRef(0);
  const parsedResult = useMemo(() => parseTotpInput(rawInput), [rawInput]);
  const parsed: ParsedTotpConfig | null = parsedResult.ok ? parsedResult.config : null;
  const parseError =
    !parsedResult.ok && rawInput.length > 0 ? t.errors[parsedResult.errorKey] : null;

  const recomputeCode = useCallback(async (config: ParsedTotpConfig, adjustedMs: number, force: boolean) => {
    const step = timeStepIndex(adjustedMs, config.period);
    if (!force && lastStepRef.current === step) return;
    lastStepRef.current = step;
    const seq = ++genSeqRef.current;
    setGenError(false);
    try {
      const code = await generateTOTP({
        secret: config.secret,
        time: adjustedMs,
        digits: config.digits,
        period: config.period,
        algorithm: config.algorithm
      });
      if (seq === genSeqRef.current) setCurrentCode(code);
    } catch {
      if (seq === genSeqRef.current) {
        setCurrentCode("");
        setGenError(true);
        lastStepRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    if (!parsed) {
      lastStepRef.current = null;
      setCurrentCode("");
      setGenError(false);
      return;
    }
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const adjustedMs = currentTimeMs(timeOffsetSec * 1000);
      setRemainingSec(remainingSecondsInPeriod(adjustedMs, parsed.period));
      setProgress(periodProgress(adjustedMs, parsed.period));
      void recomputeCode(parsed, adjustedMs, false);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [parsed, timeOffsetSec, recomputeCode]);

  const handleManualRefresh = useCallback(() => {
    if (!parsed) return;
    const adjustedMs = currentTimeMs(timeOffsetSec * 1000);
    void recomputeCode(parsed, adjustedMs, true);
  }, [parsed, timeOffsetSec, recomputeCode]);

  const handleCopy = useCallback(async () => {
    if (!currentCode) return;
    try {
      await navigator.clipboard.writeText(currentCode);
      setCopyToast(true);
      window.setTimeout(() => setCopyToast(false), 2000);
    } catch {
      setCopyToast(false);
    }
  }, [currentCode]);

  const showEmpty = rawInput.length === 0;
  const showResult = parsed && !parseError;

  return (
    <div className="totp-tool">
      <p className="totp-tool__lead text-muted">{t.panelLead}</p>

      <div className="totp-tool__field">
        <label className="form-label" htmlFor="totp-secret-input">
          {t.secretLabel}
        </label>
        <textarea
          id="totp-secret-input"
          className="totp-tool__textarea ui-textarea"
          autoComplete="off"
          spellCheck={false}
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value.replace(/\s+/g, ""))}
          placeholder={t.secretPlaceholder}
          rows={3}
        />
      </div>

      <div className="totp-tool__field totp-tool__offset">
        <label className="form-label" htmlFor="totp-offset">
          {t.offsetLabel}
        </label>
        <Input
          id="totp-offset"
          type="number"
          step={1}
          value={Number.isFinite(timeOffsetSec) ? String(timeOffsetSec) : "0"}
          onChange={(e) => setTimeOffsetSec(Number.parseInt(e.target.value, 10) || 0)}
        />
        <p className="text-muted text-xs mb-0 mt-1">{t.offsetHint}</p>
      </div>

      {parseError ? (
        <p className="totp-tool__error" role="alert">
          {parseError}
        </p>
      ) : null}

      {showEmpty ? (
        <div className="totp-tool__empty">{t.emptyHint}</div>
      ) : null}

      {showResult ? (
        <>
          <div className="totp-tool__meta" aria-label={t.panelTitle}>
            {parsed.issuer ? (
              <span>
                <span className="totp-tool__meta-k">{t.issuer}</span>
                {parsed.issuer}
              </span>
            ) : null}
            {parsed.label ? (
              <span>
                <span className="totp-tool__meta-k">{t.label}</span>
                {parsed.label}
              </span>
            ) : null}
            <span>
              <span className="totp-tool__meta-k">{t.algorithm}</span>
              {parsed.algorithm}
            </span>
            <span>
              <span className="totp-tool__meta-k">{t.digits}</span>
              {parsed.digits}
            </span>
            <span>
              <span className="totp-tool__meta-k">{t.period}</span>
              {parsed.period}
            </span>
          </div>

          <p className="form-label mb-1">{t.currentCode}</p>
          <div className="totp-tool__code-row">
            <span className="totp-tool__code" aria-live="polite">
              {currentCode || "—"}
            </span>
            <div className="totp-tool__actions">
              <Button type="button" variant="secondary" disabled={!currentCode} onClick={() => void handleCopy()}>
                {t.copy}
              </Button>
              {copyToast ? (
                <span className="totp-tool__toast" role="status">
                  {t.copiedToast}
                </span>
              ) : null}
              <Button type="button" variant="ghost" onClick={handleManualRefresh}>
                {t.refresh}
              </Button>
            </div>
          </div>
          <p className="totp-tool__countdown mb-2">{t.countdown(remainingSec)}</p>
          <div
            className="totp-tool__progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label={t.progressAria}
          >
            <div
              className="totp-tool__progress-fill"
              style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
            />
          </div>
          {genError ? (
            <p className="totp-tool__gen-err" role="status">
              {t.genError}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
