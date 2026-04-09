import { useEffect, useState } from "react";
import { useAuthStore } from "../store/authStore";
import {
  getSessionMarketLocale,
  getSettingsLocalDiagnostics,
  getUserDefaultTaskMode,
  loadRemotePreferencesForSettings,
  persistMarketLocale,
  setUserDefaultTaskMode
} from "../services/settingsPreferencesService";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useUiStrings } from "../i18n/useUiStrings";
import {
  PREF_LOCALE_IDS,
  PREF_MARKET_IDS,
  formatPrefLocale,
  formatPrefMarket,
  getUiLangMode
} from "../i18n/preferenceLabels";
import type { AicsUiTheme } from "../theme/aicsTheme";
import { applyTheme, getStoredTheme } from "../theme/aicsTheme";
import type { TaskMode } from "../types/taskMode";
import {
  loadAppPreferences,
  patchAppPreferences,
  subscribeAppPreferences,
  type AppPreferencesV1,
  type TemplatesTabPreference
} from "../modules/preferences/appPreferences";
import { clearLocalWorkbenchDraftsAndExecutionCaches } from "../modules/preferences/localAppCachesClear";
import { CLIENT_VERSION } from "../config/clientVersion";
import { SHARED_CORE_BASE_URL } from "../config/runtimeEndpoints";

/** H-1：设置与偏好正式入口（本地统一模型 + 分组 UI） */
export const SettingsPage = () => {
  const u = useUiStrings();
  const authLocaleRaw = useAuthStore((s) => s.locale);
  const authMarket = useAuthStore((s) => s.market);
  const authLocaleSession = useAuthStore((s) => s.locale);
  const prefUiMode = getUiLangMode(authLocaleRaw);

  const [prefs, setPrefs] = useState<AppPreferencesV1>(() => loadAppPreferences());
  const [uiTheme, setUiTheme] = useState<AicsUiTheme>(() => getStoredTheme());
  const [prefMarket, setPrefMarket] = useState<string>("global");
  const [prefLocale, setPrefLocale] = useState<string>("en-US");
  const [clearNotice, setClearNotice] = useState<string | null>(null);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true);
  const [electronAppVersion, setElectronAppVersion] = useState<string | null>(null);
  const [updateCheckMsg, setUpdateCheckMsg] = useState<string | null>(null);
  const [updateCheckBusy, setUpdateCheckBusy] = useState(false);

  const syncPrefs = () => setPrefs(loadAppPreferences());

  useEffect(() => subscribeAppPreferences(syncPrefs), []);

  useEffect(() => {
    const du = window.desktopUpdate;
    if (!du) return;
    void du.getPreferences().then((p) => {
      setAutoUpdateEnabled(p.autoDownloadEnabled);
      setElectronAppVersion(p.appVersion);
    });
  }, []);

  useEffect(() => {
    void loadRemotePreferencesForSettings().then((p) => {
      if (p) {
        setPrefMarket(p.market);
        setPrefLocale(p.locale);
      } else {
        const s = getSessionMarketLocale();
        setPrefMarket(s.market);
        setPrefLocale(s.locale);
      }
    });
  }, []);

  const persistLocalePair = (market: string, locale: string) => {
    void persistMarketLocale(market, locale).catch(() => {});
  };

  const diag = getSettingsLocalDiagnostics();

  const onPatchExecution = (partial: Partial<AppPreferencesV1["execution"]>) => {
    const next = patchAppPreferences({ execution: partial });
    setPrefs(next);
  };

  const onPatchMemoryTemplate = (partial: Partial<AppPreferencesV1["memoryTemplate"]>) => {
    const next = patchAppPreferences({ memoryTemplate: partial });
    setPrefs(next);
  };

  const onPatchTrust = (partial: Partial<AppPreferencesV1["trust"]>) => {
    const next = patchAppPreferences({ trust: partial });
    setPrefs(next);
  };

  const onPatchDataSafety = (partial: Partial<AppPreferencesV1["dataSafety"]>) => {
    const next = patchAppPreferences({ dataSafety: partial });
    setPrefs(next);
  };

  const onPatchContentIntel = (partial: Partial<AppPreferencesV1["contentIntelligence"]>) => {
    const next = patchAppPreferences({ contentIntelligence: partial });
    setPrefs(next);
  };

  const defaultMode = getUserDefaultTaskMode();

  return (
    <div className="page-stack settings-page">
      <header className="page-header">
        <h1 className="page-title">{u.settings.title}</h1>
        <p className="page-lead">{u.settings.lead}</p>
      </header>

      <section className="settings-section" aria-labelledby="settings-h1-locale">
        <h2 id="settings-h1-locale" className="settings-section__title">
          {u.settings.h1SectionLocale}
        </h2>
        <Card title={u.settings.themeCard}>
          <p className="text-muted mb-3">{u.settings.themeLead}</p>
          <div className="form-field">
            <label className="form-label" htmlFor="setting-ui-theme">
              {u.settings.themeLabel}
            </label>
            <select
              id="setting-ui-theme"
              className="ui-select max-w-md"
              value={uiTheme}
              onChange={(e) => {
                const next = e.target.value as AicsUiTheme;
                applyTheme(next);
                setUiTheme(next);
              }}
            >
              <option value="light">{u.settings.themeLight}</option>
              <option value="dark">{u.settings.themeDark}</option>
            </select>
          </div>
        </Card>
        <Card title={u.settings.prefCard}>
          <p className="text-muted mb-3">{u.settings.h1LocaleEffectiveNote}</p>
          <div className="form-field">
            <span className="form-label">{u.settings.h1LocaleReadOnlySummary}</span>
            <p className="mt-1 mb-0 text-sm mono-block">
              market={authMarket} · locale={authLocaleSession}
            </p>
          </div>
          <p className="text-muted text-sm mb-3">{u.settings.h1LocaleSwitchHint}</p>
          <div className="form-field">
            <label className="form-label" htmlFor="setting-country-region">
              {u.settings.countryRegion}
            </label>
            <select
              id="setting-country-region"
              className="ui-select max-w-md"
              value={prefMarket}
              onChange={(e) => {
                const m = e.target.value;
                setPrefMarket(m);
                persistLocalePair(m, prefLocale);
              }}
            >
              {PREF_MARKET_IDS.map((m) => (
                <option key={m} value={m}>
                  {formatPrefMarket(m, prefUiMode)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="setting-language">
              {u.settings.languageLabel}
            </label>
            <select
              id="setting-language"
              className="ui-select max-w-md"
              value={prefLocale}
              onChange={(e) => {
                const loc = e.target.value;
                setPrefLocale(loc);
                persistLocalePair(prefMarket, loc);
              }}
            >
              {PREF_LOCALE_IDS.map((l) => (
                <option key={l} value={l}>
                  {formatPrefLocale(l, prefUiMode)}
                </option>
              ))}
            </select>
          </div>
        </Card>
      </section>

      <section className="settings-section" aria-labelledby="settings-h1-exec">
        <h2 id="settings-h1-exec" className="settings-section__title">
          {u.settings.h1SectionExecution}
        </h2>
        <Card title={u.settings.defaultTaskModeCard}>
          <p className="text-muted mb-3">{u.settings.defaultTaskModeLead}</p>
          <div className="form-field">
            <label className="form-label" htmlFor="setting-default-task-mode">
              {u.settings.defaultTaskModeLabel}
            </label>
            <select
              id="setting-default-task-mode"
              className="ui-select max-w-md"
              value={defaultMode}
              onChange={(e) => {
                const m = e.target.value as TaskMode;
                setUserDefaultTaskMode(m);
                syncPrefs();
              }}
            >
              <option value="auto">{u.settings.defaultTaskModeAuto}</option>
              <option value="content">{u.settings.defaultTaskModeContent}</option>
              <option value="computer">{u.settings.defaultTaskModeComputer}</option>
            </select>
          </div>
          <div className="form-field flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.execution.preferAiCapabilities}
                onChange={(e) => onPatchExecution({ preferAiCapabilities: e.target.checked })}
              />
              <span>{u.settings.h1ExecutionPreferAi}</span>
            </label>
            <p className="text-muted text-sm mb-0">{u.settings.h1ExecutionPreferAiHelp}</p>
          </div>
          <div className="form-field flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.execution.showExecutionSourceAndSteps}
                onChange={(e) => onPatchExecution({ showExecutionSourceAndSteps: e.target.checked })}
              />
              <span>{u.settings.h1ExecutionShowSteps}</span>
            </label>
            <p className="text-muted text-sm mb-0">{u.settings.h1ExecutionShowStepsHelp}</p>
          </div>
        </Card>
      </section>

      <section className="settings-section" aria-labelledby="settings-h1-ci">
        <h2 id="settings-h1-ci" className="settings-section__title">
          {u.settings.h1SectionContentIntel}
        </h2>
        <Card title={u.settings.h1ContentIntelCard}>
          <p className="text-muted mb-3">{u.settings.h1ContentIntelPhase1Lead}</p>
          <div className="form-field flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.contentIntelligence.phase1WorkbenchPanel}
                onChange={(e) => onPatchContentIntel({ phase1WorkbenchPanel: e.target.checked })}
              />
              <span>{u.settings.h1ContentIntelWorkbenchPanel}</span>
            </label>
            <p className="text-muted text-sm mb-0">{u.settings.h1ContentIntelWorkbenchPanelHelp}</p>
          </div>
        </Card>
      </section>

      <section className="settings-section" aria-labelledby="settings-h1-mem">
        <h2 id="settings-h1-mem" className="settings-section__title">
          {u.settings.h1SectionMemoryTemplate}
        </h2>
        <Card title={u.settings.sectionMemoryTitle}>
          <p className="text-muted mb-3">{u.settings.sectionMemoryLead}</p>
          <div className="form-field flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.memoryTemplate.applyMemoryHintsInTasks}
                onChange={(e) => onPatchMemoryTemplate({ applyMemoryHintsInTasks: e.target.checked })}
              />
              <span>{u.settings.h1MemoryApplyHints}</span>
            </label>
            <p className="text-muted text-sm mb-0">{u.settings.h1MemoryApplyHintsHelp}</p>
          </div>
          <div className="form-field flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.memoryTemplate.showRoundMemoryHintsBar}
                onChange={(e) => onPatchMemoryTemplate({ showRoundMemoryHintsBar: e.target.checked })}
              />
              <span>{u.settings.h1MemoryShowRoundBar}</span>
            </label>
            <p className="text-muted text-sm mb-0">{u.settings.h1MemoryShowRoundBarHelp}</p>
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="setting-templates-tab">
              {u.settings.h1TemplatesDefaultTab}
            </label>
            <select
              id="setting-templates-tab"
              className="ui-select max-w-md"
              value={prefs.memoryTemplate.defaultTemplatesTab}
              onChange={(e) =>
                onPatchMemoryTemplate({ defaultTemplatesTab: e.target.value as TemplatesTabPreference })
              }
            >
              <option value="library">{u.settings.h1TemplatesTabLibrary}</option>
              <option value="mine">{u.settings.h1TemplatesTabMine}</option>
              <option value="favorites">{u.settings.h1TemplatesTabFavorites}</option>
              <option value="recent">{u.settings.h1TemplatesTabRecent}</option>
            </select>
          </div>
          <div className="form-field flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.memoryTemplate.showTemplateHintInWorkbench}
                onChange={(e) =>
                  onPatchMemoryTemplate({ showTemplateHintInWorkbench: e.target.checked })
                }
              />
              <span>{u.settings.h1TemplateWorkbenchDetailLink}</span>
            </label>
            <p className="text-muted text-sm mb-0">{u.settings.h1TemplateWorkbenchDetailLinkHelp}</p>
          </div>
        </Card>
      </section>

      <section className="settings-section" aria-labelledby="settings-h1-trust">
        <h2 id="settings-h1-trust" className="settings-section__title">
          {u.settings.h1SectionTrust}
        </h2>
        <Card title={u.settings.h1TrustCloudConfirmCard}>
          <p className="text-muted text-sm mb-3">{u.settings.h1TrustAutoCloudHelp}</p>
          <div className="form-field flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.trust.allowAutoCloudAi}
                onChange={(e) => onPatchTrust({ allowAutoCloudAi: e.target.checked })}
              />
              <span>{u.settings.h1TrustAutoCloud}</span>
            </label>
          </div>
        </Card>
        <Card title={u.settings.h1DataSafetyCard}>
          <p className="text-muted text-sm mb-3">{u.settings.h1DataSafetyLead}</p>
          <div className="form-field flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.dataSafety.allowServerHistoryWrite}
                onChange={(e) => onPatchDataSafety({ allowServerHistoryWrite: e.target.checked })}
              />
              <span>{u.settings.h1DataSafetyHistory}</span>
            </label>
            <p className="text-muted text-sm mb-0">{u.settings.h1DataSafetyHistoryHelp}</p>
          </div>
          <div className="form-field flex flex-col gap-2 mt-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.dataSafety.allowTaskMemoryWrite}
                onChange={(e) => onPatchDataSafety({ allowTaskMemoryWrite: e.target.checked })}
              />
              <span>{u.settings.h1DataSafetyMemoryWrite}</span>
            </label>
            <p className="text-muted text-sm mb-0">{u.settings.h1DataSafetyMemoryWriteHelp}</p>
          </div>
          <div className="form-field flex flex-col gap-2 mt-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.dataSafety.sendAttachmentMetadataToCore}
                onChange={(e) => onPatchDataSafety({ sendAttachmentMetadataToCore: e.target.checked })}
              />
              <span>{u.settings.h1DataSafetyAttachments}</span>
            </label>
            <p className="text-muted text-sm mb-0">{u.settings.h1DataSafetyAttachmentsHelp}</p>
          </div>
        </Card>
        <Card title={u.settings.h1LocalRuntimeCard}>
          <p className="text-muted text-sm mb-0">{u.settings.h1LocalRuntimeBody}</p>
        </Card>
        <Card title={u.settings.h1TrustResultProvenance}>
          <p className="mb-2">{u.settings.h1TrustResultProvenanceBody}</p>
        </Card>
        <Card title={u.settings.h1TrustMemoryTemplate}>
          <p className="mb-0">{u.settings.h1TrustMemoryTemplateBody}</p>
        </Card>
        {import.meta.env.DEV ? (
          <Card title={u.settings.h1TrustDevStub}>
            <p className="mb-0">{u.settings.h1TrustDevStubBody}</p>
          </Card>
        ) : null}
        <Card title={u.settings.localDiagCard}>
          <p className="text-muted mb-3">{u.settings.h1TrustClearLocalHelp}</p>
          <Button
            variant="secondary"
            onClick={() => {
              clearLocalWorkbenchDraftsAndExecutionCaches();
              setClearNotice(u.settings.h1TrustClearDone);
              window.setTimeout(() => setClearNotice(null), 5000);
            }}
          >
            {u.settings.h1TrustClearLocal}
          </Button>
          {clearNotice ? (
            <p className="text-sm mt-2 mb-0" role="status">
              {clearNotice}
            </p>
          ) : null}
        </Card>
      </section>

      {window.desktopUpdate ? (
        <section className="settings-section" aria-labelledby="settings-h1-updates">
          <h2 id="settings-h1-updates" className="settings-section__title">
            {u.settings.h1SectionUpdates}
          </h2>
          <Card title={u.settings.updatesCard}>
            <p className="text-muted mb-3">{u.settings.updatesLead}</p>
            <div className="form-field flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoUpdateEnabled}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setAutoUpdateEnabled(on);
                    void window.desktopUpdate?.setAutoDownload(on);
                  }}
                />
                <span>{u.settings.updatesAutoLabel}</span>
              </label>
              <p className="text-muted text-sm mb-0">{u.settings.updatesAutoHelp}</p>
            </div>
            <div className="form-field mt-2">
              <Button
                variant="secondary"
                type="button"
                disabled={updateCheckBusy}
                onClick={() => {
                  setUpdateCheckMsg(null);
                  setUpdateCheckBusy(true);
                  void window
                    .desktopUpdate!.runCheck({ coreBaseUrl: SHARED_CORE_BASE_URL, manual: true })
                    .then((r) => {
                      if (!r.ok) {
                        setUpdateCheckMsg(u.settings.updatesCheckFail);
                        return;
                      }
                      if (r.skipped) {
                        setUpdateCheckMsg(u.settings.updatesSkippedThrottle);
                        return;
                      }
                      const d = r.data as { hasUpdate?: boolean } | undefined;
                      if (!d?.hasUpdate) setUpdateCheckMsg(u.settings.updatesUpToDate);
                      else setUpdateCheckMsg(u.settings.updatesCheckFound);
                    })
                    .catch(() => setUpdateCheckMsg(u.settings.updatesCheckFail))
                    .finally(() => setUpdateCheckBusy(false));
                }}
              >
                {updateCheckBusy ? u.settings.updatesChecking : u.settings.updatesCheckBtn}
              </Button>
              {updateCheckMsg ? (
                <p className="text-sm mt-2 mb-0" role="status">
                  {updateCheckMsg}
                </p>
              ) : null}
            </div>
          </Card>
        </section>
      ) : null}

      <section className="settings-section" aria-labelledby="settings-h1-about">
        <h2 id="settings-h1-about" className="settings-section__title">
          {u.settings.h1SectionAbout}
        </h2>
        <Card title={u.common.productAics}>
          <div className="form-field">
            <span className="form-label">{u.settings.h1AboutVersion}</span>
            <p className="mt-1 mb-0 mono-block">{electronAppVersion ?? CLIENT_VERSION}</p>
          </div>
          <div className="form-field">
            <span className="form-label">{u.settings.h1AboutClientId}</span>
            <p className="mt-1 mb-0 mono-block">{diag.clientId}</p>
          </div>
          <p className="text-muted text-sm mb-0">
            {u.common.productAics} · {u.common.platformDesktop}
          </p>
        </Card>
      </section>
    </div>
  );
};
