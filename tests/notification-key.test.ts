import { describe, expect, it } from "vitest";
import { notificationKey } from "../src/shared/rate-limits";

describe("notification identity", () => {
  it("uses the window kind and reset timestamp", () => {
    const window = {
      usedPercent: 92,
      remainingPercent: 8,
      windowDurationMins: 300,
      resetsAt: 1_781_495_600
    };
    expect(notificationKey("fiveHour", window)).toBe("fiveHour:1781495600");
    expect(notificationKey("sevenDay", window)).toBe("sevenDay:1781495600");
  });
});
