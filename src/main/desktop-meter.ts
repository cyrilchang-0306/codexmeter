import type { MeterSettings } from "../shared/types";

export interface DesktopMeterWindow {
  setOpacity(opacity: number): void;
  setAlwaysOnTop(flag: boolean, level?: "floating"): void;
}

export function applyDesktopMeterSettings(
  window: DesktopMeterWindow,
  settings: MeterSettings
): void {
  window.setOpacity(settings.desktopOpacity / 100);
  if (settings.desktopAlwaysOnTop) {
    window.setAlwaysOnTop(true, "floating");
  } else {
    window.setAlwaysOnTop(false);
  }
}
