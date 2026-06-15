import type { CodexMeterApi } from "../shared/types";

declare global {
  interface Window {
    codexMeter: CodexMeterApi;
  }
}

export {};
