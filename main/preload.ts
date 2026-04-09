import { contextBridge, ipcRenderer } from "electron";

/**
 * 暴露 `window.secureToken`：主进程持有 token，渲染进程仅经 IPC 读写。
 *
 * 禁止项（模块 C — 须与 Core 一致）
 * - 禁止创建第二套用户系统；
 * - 禁止本地身份作为权威；
 * - 所有鉴权必须走 Shared Core；
 * - 禁止 Web / Desktop 分裂 Auth；
 * - 禁止独立 Web UI（不在此实现平行登录产品层）。
 *
 * 最终强约束：禁止 mock；禁止绕过 Shared Core；禁止多用户体系；禁止本地 Auth 成为权威。
 *
 * 补充：禁止在 preload 暴露服务端 secret；禁止绕过 IPC 读写令牌。
 */
contextBridge.exposeInMainWorld("secureToken", {
  getAccess: (): Promise<string> => ipcRenderer.invoke("token:getAccess"),
  getRefresh: (): Promise<string> => ipcRenderer.invoke("token:getRefresh"),
  setTokens: (access: string, refresh: string): Promise<void> =>
    ipcRenderer.invoke("token:setTokens", access, refresh),
  clear: (): Promise<void> => ipcRenderer.invoke("token:clear")
});

/** 模块 D：桌面扫描与能力目录（不向页面暴露密钥）。 */
contextBridge.exposeInMainWorld("aicsDesktop", {
  getSoftwareScan: (): Promise<unknown> => ipcRenderer.invoke("runtime:getSoftwareScan"),
  rescanSoftware: (): Promise<unknown> => ipcRenderer.invoke("runtime:rescanSoftware"),
  getCapabilityCatalog: (locale: string): Promise<unknown> =>
    ipcRenderer.invoke("runtime:getCapabilityCatalog", locale),
  inferCapabilities: (oneLine: string, stepTitles: string[]): Promise<unknown> =>
    ipcRenderer.invoke("runtime:inferCapabilities", { oneLine, stepTitles }),
  resolveCapabilities: (tools: unknown[], required: string[]): Promise<unknown> =>
    ipcRenderer.invoke("runtime:resolveCapabilities", { tools, required }),
  /** 同步 Windows/macOS 标题栏与界面 dark/light，避免系统浅色时顶栏仍为白底 */
  setUiChromeTheme: (theme: "dark" | "light"): Promise<void> =>
    ipcRenderer.invoke("theme:setUiChrome", theme),
  /** 与界面语言一致，用于主进程右键菜单等原生 UI 文案 */
  setUiLocale: (locale: string): Promise<void> => ipcRenderer.invoke("app:setUiLocale", locale),
  /** D-5-3B：文件整理；事件经 computer:fileOrganizeEvent 推送，须先订阅 */
  runFileOrganize: (input: { targetPath: string; strategy: string }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke("computer:runFileOrganize", input),
  onFileOrganizeEvent: (handler: (event: unknown) => void): (() => void) => {
    const listener = (_e: unknown, payload: unknown) => handler(payload);
    ipcRenderer.on("computer:fileOrganizeEvent", listener);
    return () => ipcRenderer.removeListener("computer:fileOrganizeEvent", listener);
  },
  /** D-7-4X：结果导出（保存对话框 + 主进程写盘） */
  saveTextFile: (
    input: { defaultPath?: string; content: string }
  ): Promise<
    { ok: true; filePath: string } | { ok: false; canceled: boolean }
  > => ipcRenderer.invoke("localRuntime:saveTextFile", input),
  /** Local Runtime v1：本地扫描 / 文本规则处理（无云端） */
  runLocalStep: (
    payload: { stepType: string; input: Record<string, unknown> }
  ): Promise<{
    success: boolean;
    result?: unknown;
    logs: string[];
    riskLevel: string;
  }> => ipcRenderer.invoke("localRuntime:runStep", payload)
});

/** AICS 桌面更新策略：服务端 updateType，客户端只执行；禁止启动弹窗与重复 soft 打扰 */
contextBridge.exposeInMainWorld("desktopUpdate", {
  notifyRendererReady: (payload: { coreBaseUrl: string }): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("desktopUpdate:notifyRendererReady", payload),
  runCheck: (payload: {
    coreBaseUrl: string;
    manual: boolean;
  }): Promise<
    | { ok: true; skipped?: boolean; data?: unknown }
    | { ok: false; error?: string; skipped?: boolean }
  > => ipcRenderer.invoke("desktopUpdate:runCheck", payload),
  getPreferences: (): Promise<{ appVersion: string; autoDownloadEnabled: boolean }> =>
    ipcRenderer.invoke("desktopUpdate:getPreferences"),
  setAutoDownload: (enabled: boolean): Promise<void> => ipcRenderer.invoke("desktopUpdate:setAutoDownload", enabled),
  onSoftPrompt: (handler: (payload: unknown) => void): (() => void) => {
    const listener = (_e: unknown, p: unknown) => handler(p);
    ipcRenderer.on("desktop-update:soft-prompt", listener);
    return () => ipcRenderer.removeListener("desktop-update:soft-prompt", listener);
  },
  onForceGate: (handler: (payload: unknown) => void): (() => void) => {
    const listener = (_e: unknown, p: unknown) => handler(p);
    ipcRenderer.on("desktop-update:force-gate", listener);
    return () => ipcRenderer.removeListener("desktop-update:force-gate", listener);
  },
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("desktopUpdate:openExternal", url),
  quitApp: (): Promise<void> => ipcRenderer.invoke("desktopUpdate:quitApp")
});
