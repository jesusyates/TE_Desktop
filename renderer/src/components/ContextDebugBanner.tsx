import { useEffect, useState } from "react";
import { useAuthStore } from "../store/authStore";
import { useUiStrings } from "../i18n/useUiStrings";
import { apiClient } from "../services/apiClient";
import { normalizeV1ResponseBody } from "../services/v1Envelope";
import { formatPrefLocale, formatPrefMarket, getUiLangMode } from "../i18n/preferenceLabels";

/** AICS_DEBUG_CONTEXT=1（Vite 构建时注入 import.meta.env.AICS_DEBUG_CONTEXT） */
export function ContextDebugBanner() {
  const u = useUiStrings();
  const accessToken = useAuthStore((s) => s.accessToken);
  const market = useAuthStore((s) => s.market);
  const locale = useAuthStore((s) => s.locale);
  const [meId, setMeId] = useState<string>("—");
  const productLabel = u.common.productAics;
  const platformLabel = u.common.platformDesktop;
  const uiMode = getUiLangMode(locale);

  useEffect(() => {
    if (import.meta.env.AICS_DEBUG_CONTEXT !== "1" || !accessToken) {
      setMeId("—");
      return;
    }
    apiClient
      .get<unknown>("/v1/account/session", { validateStatus: () => true })
      .then((r) => {
        const inner = normalizeV1ResponseBody(r.data) as { userId?: string } | null;
        if (r.status === 200 && inner && typeof inner.userId === "string" && inner.userId.trim())
          setMeId(inner.userId.trim());
        else setMeId("?");
      })
      .catch(() => setMeId("?"));
  }, [accessToken, market, locale]);

  if (import.meta.env.AICS_DEBUG_CONTEXT !== "1") return null;

  return (
    <div
      className="context-debug-banner"
      role="status"
      aria-label={u.settings.debug.banner}
    >
      <strong>{u.settings.debug.banner}</strong>
      <span>
        {u.settings.debug.userId}: <code>{meId}</code>
      </span>
      <span>
        {u.settings.debug.countryRegion}: {formatPrefMarket(market, uiMode)}
      </span>
      <span>
        {u.settings.debug.languageLabel}: {formatPrefLocale(locale, uiMode)}
      </span>
      <span>
        {u.settings.debug.product}: <code>{productLabel}</code>
      </span>
      <span>
        {u.settings.debug.platform}: <code>{platformLabel}</code>
      </span>
      {locale === "ja-JP" ? (
        <span className="context-debug-banner__note">{u.common.jaFallbackNote}</span>
      ) : null}
    </div>
  );
}
