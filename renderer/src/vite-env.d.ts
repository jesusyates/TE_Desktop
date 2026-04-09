/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly AICS_DEBUG_CONTEXT?: string;
  readonly AICS_API_TIMEOUT_MS?: string;
  /** D-7-5A：Shared Core 基址（可由 vite define 从进程环境注入） */
  readonly VITE_SHARED_CORE_BASE_URL?: string;
  /** D-7-5A：AI 网关基址 */
  readonly VITE_AI_GATEWAY_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    secureToken?: {
      getAccess: () => Promise<string>;
      getRefresh: () => Promise<string>;
      setTokens: (access: string, refresh: string) => Promise<void>;
      clear: () => Promise<void>;
    };
    aicsDesktop?: {
      getSoftwareScan: () => Promise<unknown>;
      rescanSoftware: () => Promise<unknown>;
      getCapabilityCatalog: (locale: string) => Promise<unknown>;
      inferCapabilities: (oneLine: string, stepTitles: string[]) => Promise<unknown>;
      resolveCapabilities: (tools: unknown[], required: string[]) => Promise<unknown>;
      setUiChromeTheme?: (theme: "dark" | "light") => Promise<void>;
      setUiLocale?: (locale: string) => Promise<void>;
      runFileOrganize?: (input: { targetPath: string; strategy: string }) => Promise<{ ok: boolean }>;
      onFileOrganizeEvent?: (handler: (event: unknown) => void) => () => void;
      saveTextFile?: (input: {
        defaultPath?: string;
        content: string;
      }) => Promise<{ ok: true; filePath: string } | { ok: false; canceled: boolean }>;
      runLocalStep?: (payload: {
        stepType: string;
        input: Record<string, unknown>;
      }) => Promise<{ success: boolean; result?: unknown; logs: string[]; riskLevel: string }>;
    };
    desktopUpdate?: {
      notifyRendererReady: (payload: { coreBaseUrl: string }) => Promise<{ ok: boolean; error?: string }>;
      runCheck: (payload: {
        coreBaseUrl: string;
        manual: boolean;
      }) => Promise<{ ok: boolean; skipped?: boolean; data?: unknown; error?: string }>;
      getPreferences: () => Promise<{ appVersion: string; autoDownloadEnabled: boolean }>;
      setAutoDownload: (enabled: boolean) => Promise<void>;
      onSoftPrompt: (handler: (payload: unknown) => void) => () => void;
      onForceGate: (handler: (payload: unknown) => void) => () => void;
      openExternal: (url: string) => Promise<void>;
      quitApp: () => Promise<void>;
    };
  }
}

export {};
