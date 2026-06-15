import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  DEFAULT_SETTINGS,
  type MeterSettings
} from "../shared/types";
import { sanitizeSettings, validateSettings } from "../shared/rate-limits";

export class SettingsStore {
  private readonly filePath: string;

  constructor(filePath = path.join(app.getPath("userData"), "settings.json")) {
    this.filePath = filePath;
  }

  async load(): Promise<MeterSettings> {
    try {
      const contents = await fs.readFile(this.filePath, "utf8");
      return sanitizeSettings(JSON.parse(contents) as Partial<MeterSettings>);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async save(settings: MeterSettings): Promise<void> {
    const validationError = validateSettings(settings);
    if (validationError) {
      throw new Error(validationError);
    }

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  }

  async reset(): Promise<MeterSettings> {
    const defaults = { ...DEFAULT_SETTINGS };
    await this.save(defaults);
    return defaults;
  }
}
