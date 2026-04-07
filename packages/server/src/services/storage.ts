import { readFileSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_DATA_DIR = join(homedir(), "Datas", "api-test");
const SETTINGS_PATH = join(DEFAULT_DATA_DIR, "settings.json");

function getDataDir(): string {
  try {
    const raw = readFileSync(SETTINGS_PATH, "utf-8");
    const settings = JSON.parse(raw);
    if (settings.storage?.dataDir) return settings.storage.dataDir;
  } catch {}
  return DEFAULT_DATA_DIR;
}

function getDefaultDataDir(): string {
  return DEFAULT_DATA_DIR;
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export const storage = {
  async read<T>(collection: string, id: string): Promise<T | null> {
    try {
      const filePath = join(getDataDir(), collection, `${id}.json`);
      const content = await readFile(filePath, "utf-8");
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  },

  async write<T>(collection: string, id: string, data: T): Promise<void> {
    const dir = join(getDataDir(), collection);
    await ensureDir(dir);
    const filePath = join(dir, `${id}.json`);
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  },

  async list<T>(collection: string): Promise<T[]> {
    const dir = join(getDataDir(), collection);
    await ensureDir(dir);
    try {
      const files = await readdir(dir);
      const items: T[] = [];
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const content = await readFile(join(dir, file), "utf-8");
        items.push(JSON.parse(content) as T);
      }
      return items;
    } catch {
      return [];
    }
  },

  async remove(collection: string, id: string): Promise<boolean> {
    try {
      const filePath = join(getDataDir(), collection, `${id}.json`);
      await rm(filePath);
      return true;
    } catch {
      return false;
    }
  },

  async readRaw(relativePath: string): Promise<string | null> {
    try {
      const filePath = join(getDataDir(), relativePath);
      return await readFile(filePath, "utf-8");
    } catch {
      return null;
    }
  },

  async writeRaw(relativePath: string, content: string): Promise<void> {
    const filePath = join(getDataDir(), relativePath);
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    await ensureDir(dir);
    await writeFile(filePath, content, "utf-8");
  },
};

export { getDefaultDataDir, getDataDir };
