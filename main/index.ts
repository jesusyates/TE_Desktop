import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { runFileOrganizerOnRoot } from "./executors/fileOrganizerExecutor.js";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import Store from "electron-store";
import { registerDesktopUpdateIpc } from "./desktopUpdate.js";
import { runLocalCapability, type LocalRuntimeRunPayload } from "./localRuntime/runLocalCapability.js";
import { contextMenuStringsForLocale } from "./contextMenuStrings.js";
import { buildLocalizedContextMenuTemplate } from "./contextMenuTemplate.js";

const requireRuntime = createRequire(import.meta.url);
const runtimeDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "runtime");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const softwareScanner = requireRuntime(path.join(runtimeDir, "scan", "software.scanner.js")) as {
  scanInstalledSoftware: () => unknown[];
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const softwareStore = requireRuntime(path.join(runtimeDir, "scan", "software.store.js")) as {
  setSoftwareScan: (tools: unknown[], platform: string) => void;
  getSoftwareScan: () => unknown;
};
const capabilityRegistry = requireRuntime(path.join(runtimeDir, "capabilities", "capability.registry.js")) as {
  getAllCapabilities: () => Array<{
    capability: string;
    label: Record<string, string>;
    infer_keywords?: string[];
    tool_candidates?: string[];
  }>;
};
const capabilityResolver = requireRuntime(path.join(runtimeDir, "capabilities", "capability.resolver.js")) as {
  inferRequiredCapabilities: (oneLine: string, stepTitles: string[]) => string[];
  resolveAll: (tools: unknown[], required: string[]) => unknown[];
};

const runDesktopScan = () => {
  try {
    const tools = softwareScanner.scanInstalledSoftware();
    softwareStore.setSoftwareScan(tools as unknown[], process.platform);
    writeMainLog("software-scan:ok", { count: (tools as unknown[]).length });
  } catch (error) {
    writeMainLog("software-scan:error", { message: error instanceof Error ? error.message : String(error) });
    softwareStore.setSoftwareScan([], process.platform);
  }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;

// Avoid disk cache permission failures on locked environments.
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disable-http-cache");
app.setPath("userData", path.join(app.getPath("temp"), "aics-desktop-user-data"));
const mainLogPath = path.join(app.getPath("userData"), "main-process.log");

const writeMainLog = (event: string, detail?: unknown) => {
  const line = `[${new Date().toISOString()}] ${event}${detail ? ` ${JSON.stringify(detail)}` : ""}\n`;
  fs.mkdirSync(path.dirname(mainLogPath), { recursive: true });
  fs.appendFileSync(mainLogPath, line, "utf-8");
};

type SecureStoreSchema = {
  /** @deprecated 使用 accessToken */
  token?: string;
  accessToken?: string;
  refreshToken?: string;
};

const secureStore = new Store<SecureStoreSchema>({ name: "aics-secure" });
/** 与 renderer `aics-ui-theme` 一致，用于启动时同步系统标题栏 / 窗口底色，避免深色界面配浅色顶栏 */
const uiChromeStore = new Store<{ uiTheme: "dark" | "light"; uiLocale: string }>({
  name: "aics-ui-chrome",
  defaults: { uiTheme: "dark", uiLocale: "zh-CN" }
});

let mainWindow: BrowserWindow | null = null;

const CHROME_BG: Record<"dark" | "light", string> = {
  dark: "#0b0f14",
  light: "#f5f7fb"
};

const applyNativeChrome = (uiTheme: "dark" | "light") => {
  uiChromeStore.set("uiTheme", uiTheme);
  nativeTheme.themeSource = uiTheme;
  const win = mainWindow;
  if (win && !win.isDestroyed()) {
    win.setBackgroundColor(CHROME_BG[uiTheme]);
  }
};

const createMainWindow = () => {
  writeMainLog("create-window:start");
  const stored = uiChromeStore.get("uiTheme");
  const initialUi: "dark" | "light" = stored === "light" ? "light" : "dark";
  nativeTheme.themeSource = initialUi;
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 1120,
    minHeight: 720,
    autoHideMenuBar: true,
    backgroundColor: CHROME_BG[initialUi],
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    writeMainLog("create-window:load-url", { url: "http://localhost:5173" });
    mainWindow.loadURL("http://localhost:5173");
  } else {
    writeMainLog("create-window:load-file", { file: path.join(__dirname, "../renderer/index.html") });
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    writeMainLog("window:closed");
    mainWindow = null;
  });

  mainWindow.webContents.on("did-fail-load", (_, code, description, validatedURL) => {
    writeMainLog("webcontents:did-fail-load", { code, description, validatedURL });
  });

  mainWindow.webContents.on("render-process-gone", (_, details) => {
    writeMainLog("webcontents:render-process-gone", details);
  });

  /** 覆盖默认 context-menu；文案随 uiLocale（由渲染进程同步），避免中英文混杂。 */
  mainWindow.webContents.on("context-menu", (_event, params) => {
    const win = mainWindow;
    if (!win) return;
    const loc = uiChromeStore.get("uiLocale", "zh-CN");
    const L = contextMenuStringsForLocale(loc);
    const template = buildLocalizedContextMenuTemplate(win, params, L);
    if (template.length > 0) {
      Menu.buildFromTemplate(template).popup({ window: win });
    }
  });
};

app.whenReady().then(() => {
  writeMainLog("app:ready", { isDev });
  runDesktopScan();
  ipcMain.handle("runtime:getSoftwareScan", () => softwareStore.getSoftwareScan());
  ipcMain.handle("runtime:rescanSoftware", () => {
    runDesktopScan();
    return softwareStore.getSoftwareScan();
  });
  ipcMain.handle("runtime:getCapabilityCatalog", (_evt, locale: string) => {
    const loc = typeof locale === "string" && locale ? locale : "en-US";
    return capabilityRegistry.getAllCapabilities().map((c) => ({
      id: c.capability,
      label: c.label[loc] || c.label["en-US"] || c.capability,
      keywords: Array.isArray(c.infer_keywords) ? c.infer_keywords : [],
      expectLocalApp: Array.isArray(c.tool_candidates) && c.tool_candidates.length > 0
    }));
  });
  ipcMain.handle(
    "runtime:inferCapabilities",
    (_evt, payload: { oneLine?: string; stepTitles?: string[] }) =>
      capabilityResolver.inferRequiredCapabilities(payload?.oneLine ?? "", payload?.stepTitles ?? [])
  );
  ipcMain.handle(
    "runtime:resolveCapabilities",
    (_evt, payload: { tools?: unknown[]; required?: string[] }) =>
      capabilityResolver.resolveAll(payload?.tools ?? [], payload?.required ?? [])
  );
  ipcMain.handle("token:getAccess", () => {
    const v = secureStore.get("accessToken", "");
    if (v) return v;
    const legacy = secureStore.get("token", "");
    return typeof legacy === "string" ? legacy : "";
  });
  ipcMain.handle("token:getRefresh", () => secureStore.get("refreshToken", ""));
  ipcMain.handle("token:setTokens", (_, access: string, refresh: string) => {
    secureStore.set("accessToken", access);
    secureStore.set("refreshToken", refresh);
    secureStore.delete("token");
  });
  ipcMain.handle("token:clear", () => {
    secureStore.delete("accessToken");
    secureStore.delete("refreshToken");
    secureStore.delete("token");
  });
  ipcMain.handle("theme:setUiChrome", (_evt, uiTheme: unknown) => {
    if (uiTheme === "dark" || uiTheme === "light") {
      applyNativeChrome(uiTheme);
    }
    return undefined;
  });
  ipcMain.handle("app:setUiLocale", (_evt, locale: unknown) => {
    const s = locale != null && typeof locale === "string" ? locale.trim() : "";
    if (s) {
      uiChromeStore.set("uiLocale", s);
    }
    return undefined;
  });

  registerDesktopUpdateIpc({
    getMainWindowRef: () => mainWindow,
    log: writeMainLog
  });

  ipcMain.handle("localRuntime:runStep", async (event, payload: unknown) => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    return runLocalCapability(parent, payload as LocalRuntimeRunPayload);
  });

  ipcMain.handle(
    "localRuntime:saveTextFile",
    async (event, input: unknown) => {
      const body = input as { defaultPath?: string; content?: string };
      const content = typeof body?.content === "string" ? body.content : "";
      const parent = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
      const opts = {
        title: "导出结果",
        defaultPath:
          typeof body?.defaultPath === "string" && body.defaultPath.trim()
            ? body.defaultPath.trim()
            : "aics-result.md",
        filters: [
          { name: "Markdown", extensions: ["md"] },
          { name: "Text", extensions: ["txt"] }
        ]
      };
      const res = parent
        ? await dialog.showSaveDialog(parent, opts)
        : await dialog.showSaveDialog(opts);
      if (res.canceled || !res.filePath) {
        return { ok: false as const, canceled: true as const };
      }
      await fs.promises.writeFile(res.filePath, content, "utf-8");
      return { ok: true as const, filePath: res.filePath };
    }
  );

  ipcMain.handle("computer:runFileOrganize", async (event, input: unknown) => {
    const body = input as { targetPath?: string; strategy?: string };
    const send = (ev: Record<string, unknown>) => {
      event.sender.send("computer:fileOrganizeEvent", {
        ...ev,
        id: typeof ev.id === "string" && ev.id ? ev.id : randomUUID(),
        timestamp: typeof ev.timestamp === "string" && ev.timestamp ? ev.timestamp : new Date().toISOString()
      });
    };
    if (body?.strategy !== "byType") {
      send({ type: "execution.error", message: "仅支持 strategy=byType" });
      return { ok: false as const };
    }
    const kind = body?.targetPath;
    if (kind !== "Desktop" && kind !== "Downloads") {
      send({ type: "execution.error", message: "targetPath 须为 Desktop 或 Downloads" });
      return { ok: false as const };
    }
    const root = kind === "Desktop" ? app.getPath("desktop") : app.getPath("downloads");
    await runFileOrganizerOnRoot(root, send);
    return { ok: true as const };
  });

  createMainWindow();
});

app.on("window-all-closed", () => {
  writeMainLog("app:window-all-closed", { platform: process.platform });
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => writeMainLog("app:before-quit"));
app.on("will-quit", () => writeMainLog("app:will-quit"));
app.on("quit", (_, exitCode) => writeMainLog("app:quit", { exitCode }));
process.on("uncaughtException", (error) => writeMainLog("process:uncaughtException", { message: error.message, stack: error.stack }));
process.on("unhandledRejection", (reason) => writeMainLog("process:unhandledRejection", { reason: String(reason) }));
