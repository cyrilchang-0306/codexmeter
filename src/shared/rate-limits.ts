import {
  DEFAULT_SETTINGS,
  type Level,
  type MeterSettings,
  type RateLimitSnapshot,
  type RateLimitWindow,
  type RawRateLimitWindow
} from "./types";

export const FIVE_HOUR_MINUTES = 300;
export const SEVEN_DAY_MINUTES = 10_080;

export function remainingPercent(usedPercent: number): number {
  return Math.max(0, Math.min(100, 100 - Math.round(usedPercent)));
}

function normalizeWindow(window: RawRateLimitWindow | null | undefined): RateLimitWindow | null {
  if (!window || typeof window.usedPercent !== "number") {
    return null;
  }

  return {
    usedPercent: Math.max(0, Math.min(100, Math.round(window.usedPercent))),
    remainingPercent: remainingPercent(window.usedPercent),
    windowDurationMins: window.windowDurationMins ?? 0,
    resetsAt: window.resetsAt ?? null
  };
}

export function identifyWindows(snapshot: RateLimitSnapshot): {
  fiveHour: RateLimitWindow | null;
  sevenDay: RateLimitWindow | null;
} {
  const windows = [normalizeWindow(snapshot.primary), normalizeWindow(snapshot.secondary)].filter(
    (window): window is RateLimitWindow => window !== null
  );

  const findByDuration = (duration: number) =>
    windows.find((window) => window.windowDurationMins === duration) ?? null;

  return {
    fiveHour: findByDuration(FIVE_HOUR_MINUTES),
    sevenDay: findByDuration(SEVEN_DAY_MINUTES)
  };
}

export function mergeSnapshot(
  current: RateLimitSnapshot | null,
  update: RateLimitSnapshot
): RateLimitSnapshot {
  if (!current) {
    return update;
  }

  return {
    ...current,
    ...update,
    primary: update.primary === undefined ? current.primary : update.primary,
    secondary: update.secondary === undefined ? current.secondary : update.secondary
  };
}

export function validateSettings(settings: MeterSettings): string | null {
  const integerFields: Array<[string, number]> = [
    ["红色上限", settings.redMax],
    ["黄色上限", settings.yellowMax],
    ["通知阈值", settings.notificationThreshold]
  ];

  for (const [label, value] of integerFields) {
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      return `${label}必须是 0 到 100 之间的整数。`;
    }
  }

  if (settings.redMax >= settings.yellowMax) {
    return "红色上限必须小于黄色上限。";
  }

  return null;
}

export function sanitizeSettings(value: Partial<MeterSettings> | null | undefined): MeterSettings {
  const candidate: MeterSettings = {
    redMax: value?.redMax ?? DEFAULT_SETTINGS.redMax,
    yellowMax: value?.yellowMax ?? DEFAULT_SETTINGS.yellowMax,
    notificationThreshold:
      value?.notificationThreshold ?? DEFAULT_SETTINGS.notificationThreshold,
    launchAtLogin: value?.launchAtLogin ?? DEFAULT_SETTINGS.launchAtLogin,
    notificationsEnabled:
      value?.notificationsEnabled ?? DEFAULT_SETTINGS.notificationsEnabled
  };

  return validateSettings(candidate) ? { ...DEFAULT_SETTINGS } : candidate;
}

export function levelForRemaining(remaining: number, settings: MeterSettings): Level {
  if (remaining <= settings.redMax) {
    return "red";
  }
  if (remaining <= settings.yellowMax) {
    return "yellow";
  }
  return "green";
}

export function notificationKey(kind: string, window: RateLimitWindow): string {
  return `${kind}:${window.resetsAt ?? "unknown"}`;
}
