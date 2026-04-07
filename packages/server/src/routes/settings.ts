import type { Settings } from "@nexqa/shared";
import { SettingsSchema } from "@nexqa/shared";
import { Hono } from "hono";
import { getDefaultLogDir, getLogDir } from "../services/logger.js";
import { getDataDir, getDefaultDataDir, storage } from "../services/storage.js";

const SETTINGS_FILE = "settings.json";

export const settingsRoutes = new Hono()
  .get("/", async (c) => {
    const raw = await storage.readRaw(SETTINGS_FILE);
    if (!raw) {
      const defaults = SettingsSchema.parse({});
      return c.json(defaults);
    }
    return c.json(JSON.parse(raw) as Settings);
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
    return c.json(settings);
  });
