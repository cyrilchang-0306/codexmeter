import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  screen,
  shell
} from "electron";
import path from "node:path";
import { appendFileSync, promises as fs } from "node:fs";
import type {
  ConnectionStatus,
  MeterSettings,
  MeterState,
  RateLimitSnapshot
} from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/types";
import { identifyWindows, validateSettings } from "../shared/rate-limits";
import { CodexClient } from "./codex-client";
import { NotificationManager } from "./notification-manager";
import { SettingsStore } from "./settings-store";

let mainWindow: BrowserWindow | null = null;
let bannerWindow: BrowserWindow | null = null;
let refreshTimer: NodeJS.Timeout | null = null;
let bannerPositionTimer: NodeJS.Timeout | null = null;

interface BannerPosition {
  x: number;
  y: number;
}

const client = new CodexClient();
const notifications = new NotificationManager();
let settingsStore: SettingsStore;
let state: MeterState = {
  connection: "connecting",
  fiveHour: null,
  sevenDay: null,
  settings: { ...DEFAULT_SETTINGS },
  lastUpdatedAt: null,
  error: null
};

const isDevelopment = !app.isPackaged;
const rendererUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173";
const startedHidden = process.argv.includes("--hidden");
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (app.isReady()) {
      showMainWindow();
    } else {
      app.once("ready", () => showMainWindow());
    }
  });
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) {
    return;
  }

  settingsStore = new SettingsStore();
  state.settings = await settingsStore.load();
  applyLoginItemSetting();
  registerIpc();
  await showDesktopMeter();
  bindClientEvents();
  nativeTheme.on("updated", updateNativeWindowColors);
  broadcastState();
  if (!startedHidden) {
    showMainWindow();
  }

  client.start().catch((error: Error) => {
    logMessage("Codex client start failed", error);
    updateConnection("error", readableCodexError(error.message));
  });

  refreshTimer = setInterval(() => {
    client.refresh().catch((error: Error) => {
      updateConnection("error", readableCodexError(error.message));
    });
  }, 60_000);
}).catch((error: Error) => {
  logMessage("Application startup failed", error);
});

app.on("activate", () => {
  if (hasSingleInstanceLock && app.isReady()) {
    showMainWindow();
  }
});

app.on("window-all-closed", () => {
  // The desktop meter owns the application lifecycle.
});

app.on("before-quit", () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  if (bannerPositionTimer) {
    clearTimeout(bannerPositionTimer);
  }
  client.stop();
});

function bindClientEvents(): void {
  client.on("snapshot", (snapshot: RateLimitSnapshot) => {
    const windows = identifyWindows(snapshot);
    state = {
      ...state,
      ...windows,
      connection: "connected",
      lastUpdatedAt: Date.now(),
      error: null
    };
    notifications.evaluate(state);
    broadcastState();
  });

  client.on("status", (status: ConnectionStatus, error?: string) => {
    if (error) {
      logMessage(`Codex status: ${status}`, error);
    }
    updateConnection(status, error ? readableCodexError(error) : null);
  });

  client.on("diagnostic", (message: string) => {
    logMessage("Codex diagnostic", message);
  });
}

function updateConnection(connection: ConnectionStatus, error: string | null): void {
  state = { ...state, connection, error };
  broadcastState();
}

function createWindow(mode: "main" | "banner"): BrowserWindow {
  const isBanner = mode === "banner";
  const window = new BrowserWindow({
    width: isBanner ? 344 : 900,
    height: isBanner ? 76 : 680,
    minWidth: isBanner ? 344 : 780,
    minHeight: isBanner ? 76 : 600,
    show: false,
    frame: !isBanner,
    resizable: !isBanner,
    transparent: isBanner,
    title: "Codex Meter",
    backgroundColor: isBanner ? "#00000000" : nativeWindowBackground(),
    alwaysOnTop: isBanner,
    skipTaskbar: isBanner,
    focusable: !isBanner,
    hasShadow: !isBanner,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const query = `?mode=${mode}`;
  if (isDevelopment) {
    void window.loadURL(`${rendererUrl}/${query}`);
  } else {
    void window.loadFile(path.join(__dirname, "../renderer/index.html"), {
      query: { mode }
    });
  }

  return window;
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow("main");
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
  app.focus({ steal: true });
}

async function showDesktopMeter(): Promise<void> {
  if (!bannerWindow || bannerWindow.isDestroyed()) {
    bannerWindow = createWindow("banner");
    bannerWindow.setAlwaysOnTop(true, "floating");
    bannerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    bannerWindow.on("moved", scheduleBannerPositionSave);
  }

  const bounds = bannerWindow.getBounds();
  const savedPosition = await loadBannerPosition();
  if (savedPosition && isBannerPositionVisible(savedPosition, bounds.width, bounds.height)) {
    bannerWindow.setPosition(savedPosition.x, savedPosition.y, false);
  } else {
    const display = screen.getPrimaryDisplay();
    bannerWindow.setPosition(
      display.workArea.x + display.workArea.width - bounds.width - 12,
      display.workArea.y + 6,
      false
    );
  }
  bannerWindow.showInactive();
}

function nativeWindowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? "#111317" : "#F2F4F7";
}

function updateNativeWindowColors(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(nativeWindowBackground());
  }
}

function bannerPositionPath(): string {
  return path.join(app.getPath("userData"), "banner-position.json");
}

async function loadBannerPosition(): Promise<BannerPosition | null> {
  try {
    const contents = await fs.readFile(bannerPositionPath(), "utf8");
    const value = JSON.parse(contents) as Partial<BannerPosition>;
    if (Number.isInteger(value.x) && Number.isInteger(value.y)) {
      return { x: value.x as number, y: value.y as number };
    }
  } catch {
    // A missing or invalid position falls back to the top-right corner.
  }
  return null;
}

function isBannerPositionVisible(position: BannerPosition, width: number, height: number): boolean {
  const centerX = position.x + width / 2;
  const centerY = position.y + height / 2;
  return screen.getAllDisplays().some(({ workArea }) =>
    centerX >= workArea.x &&
    centerX <= workArea.x + workArea.width &&
    centerY >= workArea.y &&
    centerY <= workArea.y + workArea.height
  );
}

function scheduleBannerPositionSave(): void {
  if (!bannerWindow || bannerWindow.isDestroyed()) {
    return;
  }
  if (bannerPositionTimer) {
    clearTimeout(bannerPositionTimer);
  }
  bannerPositionTimer = setTimeout(() => {
    if (!bannerWindow || bannerWindow.isDestroyed()) {
      return;
    }
    const { x, y } = bannerWindow.getBounds();
    void saveBannerPosition({ x, y });
  }, 200);
}

async function saveBannerPosition(position: BannerPosition): Promise<void> {
  try {
    const filePath = bannerPositionPath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(position, null, 2)}\n`, "utf8");
  } catch (error) {
    logMessage("Unable to save desktop meter position", error);
  }
}

async function refreshNow(): Promise<void> {
  updateConnection("connecting", null);
  try {
    await client.refresh();
  } catch (error) {
    updateConnection("error", readableCodexError((error as Error).message));
  }
}

function broadcastState(): void {
  for (const window of [mainWindow, bannerWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send("meter:state-changed", state);
    }
  }
}

function registerIpc(): void {
  ipcMain.handle("meter:get-state", () => state);
  ipcMain.handle("meter:refresh", async () => refreshNow());
  ipcMain.handle("meter:open-main", () => showMainWindow());
  ipcMain.handle("meter:open-external", async (_event, url: string) => {
    const allowedUrl = "https://github.com/cyrilchang-0306/codexmeter";
    if (url !== allowedUrl) {
      return false;
    }
    await shell.openExternal(allowedUrl);
    return true;
  });
  ipcMain.handle("meter:quit", () => app.quit());
  ipcMain.handle("meter:save-settings", async (_event, settings: MeterSettings) => {
    const error = validateSettings(settings);
    if (error) {
      return { ok: false, error };
    }
    await settingsStore.save(settings);
    state = { ...state, settings };
    applyLoginItemSetting();
    notifications.evaluate(state);
    broadcastState();
    return { ok: true, settings };
  });
  ipcMain.handle("meter:reset-settings", async () => {
    const settings = await settingsStore.reset();
    state = { ...state, settings };
    applyLoginItemSetting();
    broadcastState();
    return settings;
  });
}

function applyLoginItemSetting(): void {
  if (process.platform !== "darwin") {
    return;
  }
  const current = app.getLoginItemSettings();
  if (current.openAtLogin === state.settings.launchAtLogin) {
    return;
  }
  try {
    app.setLoginItemSettings({
      openAtLogin: state.settings.launchAtLogin,
      openAsHidden: true,
      args: ["--hidden"]
    });
  } catch (error) {
    console.warn("Unable to update login item:", error);
  }
}

function readableCodexError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("enoent") || normalized.includes("not found")) {
    return "未找到 Codex。请先安装 Codex Desktop 或 Codex CLI。";
  }
  if (normalized.includes("login") || normalized.includes("auth")) {
    return "Codex 尚未登录，请先在 Codex 中完成登录。";
  }
  if (normalized.includes("readonly database")) {
    return "无法访问 Codex 本地状态，请检查 Codex 数据目录权限。";
  }
  return message || "无法连接本机 Codex。";
}

function logMessage(label: string, detail: unknown): void {
  try {
    const logPath = path.join(app.getPath("userData"), "codex-meter.log");
    const rendered = detail instanceof Error ? detail.stack ?? detail.message : String(detail);
    appendFileSync(logPath, `[${new Date().toISOString()}] ${label}: ${rendered}\n`, "utf8");
  } catch {
    // Logging must never interrupt app startup.
  }
}
