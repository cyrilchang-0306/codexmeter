import { Notification } from "electron";
import type { MeterSettings, MeterState, MeterKind, RateLimitWindow } from "../shared/types";
import { notificationKey } from "../shared/rate-limits";

export class NotificationManager {
  private notifiedKeys = new Set<string>();

  evaluate(state: MeterState): void {
    const settings = state.settings;
    if (!settings.notificationsEnabled || !Notification.isSupported()) {
      return;
    }

    this.evaluateWindow("fiveHour", "5 小时", state.fiveHour, settings);
    this.evaluateWindow("sevenDay", "7 天", state.sevenDay, settings);
  }

  private evaluateWindow(
    kind: MeterKind,
    label: string,
    window: RateLimitWindow | null,
    settings: MeterSettings
  ): void {
    if (!window) {
      return;
    }

    const key = notificationKey(kind, window);
    this.removeExpiredKeys(kind, key);
    if (window.remainingPercent > settings.notificationThreshold || this.notifiedKeys.has(key)) {
      return;
    }

    new Notification({
      title: `${label} Codex 余量偏低`,
      body: `当前剩余 ${window.remainingPercent}%，将在 ${formatReset(window.resetsAt)} 重置。`
    }).show();
    this.notifiedKeys.add(key);
  }

  private removeExpiredKeys(kind: MeterKind, currentKey: string): void {
    for (const key of this.notifiedKeys) {
      if (key.startsWith(`${kind}:`) && key !== currentKey) {
        this.notifiedKeys.delete(key);
      }
    }
  }
}

function formatReset(timestamp: number | null): string {
  if (!timestamp) {
    return "未知时间";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp * 1000));
}
