import type { Settings } from "@nexqa/shared";
import { SettingsSchema } from "@nexqa/shared";
import { Hono } from "hono";
import { getDefaultLogDir, getLogDir } from "../services/logger.js";
import { getDataDir, getDefaultDataDir, storage } from "../services/storage.js";

const SETTINGS_FILE = "settings.json";

/**
 * Mask a secret string for API responses.
 * Keeps the first 6 and last 4 characters, replaces the middle with "***".
 * Short values (≤10 chars) are fully masked to "******".
 */
function maskSecret(value: string | undefined): string | undefined {
  if (!value) return value;
  if (value.length <= 10) return "******";
  return value.slice(0, 6) + "***" + value.slice(-4);
}

/** Return a copy of settings with sensitive fields masked for API response. */
function maskSettingsSecrets(settings: Settings): Settings {
  const masked = structuredClone(settings);
  if (masked.llm?.apiKey) {
    masked.llm.apiKey = maskSecret(masked.llm.apiKey)!;
  }
  return masked;
}

export const settingsRoutes = new Hono()
  .get("/", async (c) => {
    const raw = await storage.readRaw(SETTINGS_FILE);
    if (!raw) {
      const defaults = SettingsSchema.parse({});
      return c.json(maskSettingsSecrets(defaults));
    }
    return c.json(maskSettingsSecrets(JSON.parse(raw) as Settings));
  })
  .get("/defaults", (c) => {
    return c.json({
      dataDir: getDefaultDataDir(),
      logDir: getDefaultLogDir(),
      currentDataDir: getDataDir(),
      currentLogDir: getLogDir(),
    });
  })
  .post("/update", async (c) => {
    const body = await c.req.json();
    const settings = SettingsSchema.parse(body);
    await storage.writeRaw(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    return c.json(maskSettingsSecrets(settings));
  });
