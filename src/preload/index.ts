import { contextBridge, ipcRenderer } from "electron";
import type { CodexMeterApi, MeterSettings, MeterState } from "../shared/types";

const api: CodexMeterApi = {
  getState: () => ipcRenderer.invoke("meter:get-state"),
  refresh: () => ipcRenderer.invoke("meter:refresh"),
  saveSettings: (settings: MeterSettings) => ipcRenderer.invoke("meter:save-settings", settings),
  resetSettings: () => ipcRenderer.invoke("meter:reset-settings"),
  openMainWindow: () => ipcRenderer.invoke("meter:open-main"),
  openExternal: (url: string) => ipcRenderer.invoke("meter:open-external", url),
  quit: () => ipcRenderer.invoke("meter:quit"),
  onStateChanged: (callback: (state: MeterState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: MeterState) => callback(state);
    ipcRenderer.on("meter:state-changed", listener);
    return () => ipcRenderer.removeListener("meter:state-changed", listener);
  }
};

contextBridge.exposeInMainWorld("codexMeter", api);
