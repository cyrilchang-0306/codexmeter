import { describe, expect, it, vi } from "vitest";
import { applyDesktopMeterSettings } from "../src/main/desktop-meter";
import { DEFAULT_SETTINGS } from "../src/shared/types";

describe("desktop meter window settings", () => {
  it("applies opacity and floating always-on-top mode", () => {
    const window = {
      setOpacity: vi.fn(),
      setAlwaysOnTop: vi.fn()
    };

    applyDesktopMeterSettings(window, {
      ...DEFAULT_SETTINGS,
      desktopOpacity: 65,
      desktopAlwaysOnTop: true
    });

    expect(window.setOpacity).toHaveBeenCalledWith(0.65);
    expect(window.setAlwaysOnTop).toHaveBeenCalledWith(true, "floating");
  });

  it("allows the desktop meter to sit behind other applications", () => {
    const window = {
      setOpacity: vi.fn(),
      setAlwaysOnTop: vi.fn()
    };

    applyDesktopMeterSettings(window, {
      ...DEFAULT_SETTINGS,
      desktopAlwaysOnTop: false
    });

    expect(window.setAlwaysOnTop).toHaveBeenCalledWith(false);
  });
});
