import { contextBridge, ipcRenderer } from "electron";

export type TokenBridge = {
  get: () => Promise<string>;
  set: (token: string) => Promise<void>;
  clear: () => Promise<void>;
};

const tokenBridge: TokenBridge = {
  get: () => ipcRenderer.invoke("token:get"),
  set: (token) => ipcRenderer.invoke("token:set", token),
  clear: () => ipcRenderer.invoke("token:clear")
};

contextBridge.exposeInMainWorld("secureToken", tokenBridge);
