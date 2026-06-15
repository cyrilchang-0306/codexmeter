import { describe, expect, it } from "vitest";
import {
  identifyWindows,
  levelForRemaining,
  mergeSnapshot,
  remainingPercent,
  sanitizeSettings,
  validateSettings
} from "../src/shared/rate-limits";
import { DEFAULT_SETTINGS } from "../src/shared/types";

describe("rate limit calculations", () => {
  it("calculates and clamps remaining percentage", () => {
    expect(remainingPercent(17)).toBe(83);
    expect(remainingPercent(130)).toBe(0);
    expect(remainingPercent(-10)).toBe(100);
  });

  it("identifies five-hour and seven-day windows by duration", () => {
    const windows = identifyWindows({
      primary: { usedPercent: 17, windowDurationMins: 300, resetsAt: 1 },
      secondary: { usedPercent: 48, windowDurationMins: 10_080, resetsAt: 2 }
    });
    expect(windows.fiveHour?.remainingPercent).toBe(83);
    expect(windows.sevenDay?.remainingPercent).toBe(52);
  });

  it("does not guess when durations are missing", () => {
    expect(
      identifyWindows({ primary: { usedPercent: 10 }, secondary: { usedPercent: 20 } })
    ).toEqual({ fiveHour: null, sevenDay: null });
  });

  it("merges sparse snapshots without clearing omitted windows", () => {
    const merged = mergeSnapshot(
      {
        primary: { usedPercent: 10, windowDurationMins: 300 },
        secondary: { usedPercent: 20, windowDurationMins: 10_080 }
      },
      { primary: { usedPercent: 30, windowDurationMins: 300 } }
    );
    expect(merged.primary?.usedPercent).toBe(30);
    expect(merged.secondary?.usedPercent).toBe(20);
  });
});

describe("threshold settings", () => {
  it("maps default boundaries to green, yellow and red", () => {
    expect(levelForRemaining(31, DEFAULT_SETTINGS)).toBe("green");
    expect(levelForRemaining(30, DEFAULT_SETTINGS)).toBe("yellow");
    expect(levelForRemaining(11, DEFAULT_SETTINGS)).toBe("yellow");
    expect(levelForRemaining(10, DEFAULT_SETTINGS)).toBe("red");
  });

  it("rejects invalid and overlapping settings", () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toBeNull();
    expect(validateSettings({ ...DEFAULT_SETTINGS, redMax: 30, yellowMax: 30 })).toContain(
      "红色上限"
    );
    expect(validateSettings({ ...DEFAULT_SETTINGS, notificationThreshold: 101 })).toContain(
      "通知阈值"
    );
    expect(validateSettings({ ...DEFAULT_SETTINGS, redMax: 10.5 })).toContain("整数");
    expect(validateSettings({ ...DEFAULT_SETTINGS, desktopOpacity: 19 })).toContain("透明度");
  });

  it("fills new desktop meter settings for existing users", () => {
    expect(
      sanitizeSettings({
        redMax: 10,
        yellowMax: 30,
        notificationThreshold: 10,
        launchAtLogin: false,
        notificationsEnabled: true
      })
    ).toMatchObject({
      desktopOpacity: 100,
      desktopAlwaysOnTop: true
    });
  });
});
