export type MeterKind = "fiveHour" | "sevenDay";
export type ConnectionStatus = "connecting" | "connected" | "error";
export type Level = "green" | "yellow" | "red";

export interface RateLimitWindow {
  usedPercent: number;
  remainingPercent: number;
  windowDurationMins: number;
  resetsAt: number | null;
}

export interface RateLimitSnapshot {
  limitId?: string | null;
  primary?: RawRateLimitWindow | null;
  secondary?: RawRateLimitWindow | null;
  planType?: string | null;
  rateLimitReachedType?: string | null;
}

export interface RawRateLimitWindow {
  usedPercent: number;
  windowDurationMins?: number | null;
  resetsAt?: number | null;
}

export interface MeterSettings {
  redMax: number;
  yellowMax: number;
  notificationThreshold: number;
  launchAtLogin: boolean;
  notificationsEnabled: boolean;
  desktopOpacity: number;
  desktopAlwaysOnTop: boolean;
  desktopLocked: boolean;
}

export interface MeterState {
  connection: ConnectionStatus;
  fiveHour: RateLimitWindow | null;
  sevenDay: RateLimitWindow | null;
  settings: MeterSettings;
  lastUpdatedAt: number | null;
  error: string | null;
}

export interface SaveSettingsResult {
  ok: boolean;
  settings?: MeterSettings;
  error?: string;
}

export interface CodexMeterApi {
  getState(): Promise<MeterState>;
  refresh(): Promise<void>;
  saveSettings(settings: MeterSettings): Promise<SaveSettingsResult>;
  resetSettings(): Promise<MeterSettings>;
  openMainWindow(): Promise<void>;
  openExternal(url: string): Promise<boolean>;
  quit(): Promise<void>;
  onStateChanged(callback: (state: MeterState) => void): () => void;
}

export const DEFAULT_SETTINGS: MeterSettings = {
  redMax: 10,
  yellowMax: 30,
  notificationThreshold: 10,
  launchAtLogin: false,
  notificationsEnabled: true,
  desktopOpacity: 100,
  desktopAlwaysOnTop: true,
  desktopLocked: false
};
