import { app, BrowserWindow, ipcMain, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import Store from "electron-store";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

type UpdateStoreSchema = {
  lastRemoteCheckAt: number;
  lastSoftPromptTargetVersion: string | null;
  autoDownloadEnabled: boolean;
  lastSilentDownloadKey: string | null;
};

export type DesktopUpdatePayload = {
  hasUpdate: boolean;
  updateType: "silent" | "soft" | "force";
  targetVersion: string | null;
  downloadUrl: string | null;
  releaseNotes: string | null;
  message: string | null;
};

type SoftPromptIpc = {
  targetVersion: string;
  message: string | null;
  releaseNotes: string | null;
};

type ForceGateIpc = {
  targetVersion: string;
  message: string | null;
  downloadUrl: string | null;
};

const updateStore = new Store<UpdateStoreSchema>({
  name: "aics-desktop-update-policy",
  defaults: {
    lastRemoteCheckAt: 0,
    lastSoftPromptTargetVersion: null,
    autoDownloadEnabled: true,
    lastSilentDownloadKey: null
  }
});

let lastCoreBaseUrl: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function normalizeBaseUrl(u: string): string {
  return u.trim().replace(/\/+$/, "");
}

let getMainWindow: () => BrowserWindow | null = () => null;
let writeLog: (event: string, detail?: unknown) => void = () => {};

async function fetchUpdateManifest(
  coreBaseUrl: string,
  currentVersion: string
): Promise<DesktopUpdatePayload | null> {
  const base = normalizeBaseUrl(coreBaseUrl);
  const q = new URLSearchParams({
    currentVersion,
    platform: process.platform,
    channel: "stable"
  });
  const url = `${base}/aics/desktop/update-check?${q.toString()}`;
  try {
    const res = await fetch(url, { method: "GET" });
    const json = (await res.json()) as { success?: boolean; data?: DesktopUpdatePayload };
    if (!json?.success || !json.data || typeof json.data.hasUpdate !== "boolean") {
      return null;
    }
    return json.data;
  } catch (e) {
    writeLog("desktop-update:fetch-fail", { message: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

function downloadToFile(urlStr: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const isHttps = urlStr.startsWith("https:");
    const client = isHttps ? https : http;
    const req = client.get(urlStr, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        void downloadToFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`http_${res.statusCode ?? "unknown"}`));
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
    });
    req.on("error", reject);
  });
}

function maybeStartSilentDownload(data: DesktopUpdatePayload): void {
  if (!data.hasUpdate || data.updateType !== "silent") return;
  if (!updateStore.get("autoDownloadEnabled")) return;
  const url = data.downloadUrl?.trim();
  const tv = data.targetVersion?.trim();
  if (!url || !tv) return;
  if (!url.startsWith("https://") && !url.startsWith("http://")) return;
  const key = `${tv}::${url}`;
  if (updateStore.get("lastSilentDownloadKey") === key) return;

  const dir = path.join(app.getPath("userData"), "updates");
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `aics-${tv}-pending.pkg`);
  void downloadToFile(url, dest)
    .then(() => {
      updateStore.set("lastSilentDownloadKey", key);
      writeLog("desktop-update:silent-download-ok", { dest });
    })
    .catch((e) => writeLog("desktop-update:silent-download-fail", { message: String(e) }));
}

function applyUpdatePolicy(data: DesktopUpdatePayload): void {
  const win = getMainWindow();
  if (!data.hasUpdate) return;

  maybeStartSilentDownload(data);

  if (data.updateType === "soft" && data.targetVersion) {
    const v = data.targetVersion.trim();
    const prev = updateStore.get("lastSoftPromptTargetVersion");
    if (prev === v) return;
    updateStore.set("lastSoftPromptTargetVersion", v);
    const payload: SoftPromptIpc = {
      targetVersion: v,
      message: data.message ?? null,
      releaseNotes: data.releaseNotes ?? null
    };
    win?.webContents.send("desktop-update:soft-prompt", payload);
    writeLog("desktop-update:soft-prompt", { targetVersion: v });
  }

  if (data.updateType === "force") {
    const payload: ForceGateIpc = {
      targetVersion: data.targetVersion?.trim() || "",
      message: data.message ?? null,
      downloadUrl: data.downloadUrl?.trim() ?? null
    };
    win?.webContents.send("desktop-update:force-gate", payload);
    writeLog("desktop-update:force-gate", { targetVersion: payload.targetVersion });
  }
}

async function runRemoteCheck(
  coreBaseUrl: string,
  options: { manual: boolean; currentVersion: string }
): Promise<{ ok: boolean; skipped?: boolean; data?: DesktopUpdatePayload | null; error?: string }> {
  const now = Date.now();
  const last = updateStore.get("lastRemoteCheckAt");
  if (!options.manual && last > 0 && now - last < SIX_HOURS_MS) {
    return { ok: true, skipped: true };
  }

  const data = await fetchUpdateManifest(coreBaseUrl, options.currentVersion);
  updateStore.set("lastRemoteCheckAt", Date.now());

  if (!data) {
    return { ok: false, error: "fetch_failed" };
  }

  applyUpdatePolicy(data);
  return { ok: true, data };
}

export function registerDesktopUpdateIpc(opts: {
  getMainWindowRef: () => BrowserWindow | null;
  log: (event: string, detail?: unknown) => void;
}): void {
  getMainWindow = opts.getMainWindowRef;
  writeLog = opts.log;

  ipcMain.handle(
    "desktopUpdate:notifyRendererReady",
    async (_evt, payload: { coreBaseUrl?: string }) => {
      const raw = typeof payload?.coreBaseUrl === "string" ? payload.coreBaseUrl : "";
      if (!raw.trim()) return { ok: false as const, error: "no_base_url" };
      lastCoreBaseUrl = normalizeBaseUrl(raw);
      await runRemoteCheck(lastCoreBaseUrl, { manual: false, currentVersion: app.getVersion() });
      if (!pollTimer && lastCoreBaseUrl) {
        pollTimer = setInterval(() => {
          void runRemoteCheck(lastCoreBaseUrl!, { manual: false, currentVersion: app.getVersion() });
        }, SIX_HOURS_MS);
      }
      return { ok: true as const };
    }
  );

  ipcMain.handle(
    "desktopUpdate:runCheck",
    async (_evt, payload: { coreBaseUrl?: string; manual?: boolean }) => {
      const base =
        typeof payload?.coreBaseUrl === "string" && payload.coreBaseUrl.trim()
          ? normalizeBaseUrl(payload.coreBaseUrl)
          : lastCoreBaseUrl;
      if (!base) return { ok: false as const, error: "no_base_url" };
      const manual = Boolean(payload?.manual);
      return runRemoteCheck(base, { manual, currentVersion: app.getVersion() });
    }
  );

  ipcMain.handle("desktopUpdate:getPreferences", () => ({
    appVersion: app.getVersion(),
    autoDownloadEnabled: updateStore.get("autoDownloadEnabled")
  }));

  ipcMain.handle("desktopUpdate:setAutoDownload", (_evt, enabled: unknown) => {
    updateStore.set("autoDownloadEnabled", Boolean(enabled));
  });

  ipcMain.handle("desktopUpdate:openExternal", (_evt, url: unknown) => {
    if (typeof url !== "string") return;
    const u = url.trim();
    if (u.startsWith("https://") || u.startsWith("http://")) void shell.openExternal(u);
  });

  ipcMain.handle("desktopUpdate:quitApp", () => {
    app.quit();
  });
}
