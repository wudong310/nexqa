/**
 * migrate-json-to-sqlite.ts
 *
 * Migrates existing JSON file storage to SQLite.
 * Run: npx tsx apps/backend/src/scripts/migrate-json-to-sqlite.ts
 *
 * - Scans the data directory for collection subdirectories
 * - Imports all .json files into the kv_store table
 * - Imports top-level .json files (settings.json, oss.json, etc.) into raw_files table
 */

import { mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const DEFAULT_DATA_DIR = join(homedir(), "Datas", "api-test");
const SETTINGS_PATH = join(DEFAULT_DATA_DIR, "settings.json");
const DB_FILENAME = "nexqa.db";

function getDataDir(): string {
  try {
    const raw = readFileSync(SETTINGS_PATH, "utf-8");
    const settings = JSON.parse(raw);
    if (settings.storage?.dataDir) return settings.storage.dataDir;
  } catch {}
  return DEFAULT_DATA_DIR;
}

function main() {
  const dataDir = getDataDir();
  console.log(`[migrate] Data directory: ${dataDir}`);

  mkdirSync(dataDir, { recursive: true });

  const dbPath = join(dataDir, DB_FILENAME);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS raw_files (
      path TEXT PRIMARY KEY,
      content TEXT NOT NULL
    );
  `);

  const insertKv = db.prepare(
    "INSERT OR REPLACE INTO kv_store (collection, id, data) VALUES (?, ?, ?)",
  );
  const insertRaw = db.prepare(
    "INSERT OR REPLACE INTO raw_files (path, content) VALUES (?, ?)",
  );

  let kvCount = 0;
  let rawCount = 0;

  // Scan data directory
  let entries: string[];
  try {
    entries = readdirSync(dataDir);
  } catch {
    console.log("[migrate] Data directory is empty or inaccessible. Nothing to migrate.");
    db.close();
    return;
  }

  const insertMany = db.transaction(() => {
    for (const entry of entries) {
      const entryPath = join(dataDir, entry);

      // Skip the database file itself
      if (entry === DB_FILENAME || entry.endsWith("-wal") || entry.endsWith("-shm")) {
        continue;
      }

      const stat = statSync(entryPath);

      if (stat.isDirectory()) {
        // This is a collection directory
        const collection = entry;
        let files: string[];
        try {
          files = readdirSync(entryPath);
        } catch {
          continue;
        }

        for (const file of files) {
          if (!file.endsWith(".json")) continue;
          const id = file.replace(/\.json$/, "");
          try {
            const content = readFileSync(join(entryPath, file), "utf-8");
            // Validate JSON
            JSON.parse(content);
            insertKv.run(collection, id, content);
            kvCount++;
          } catch (err) {
            console.warn(`[migrate] Skipped invalid JSON: ${collection}/${file}`, err);
          }
        }
      } else if (stat.isFile() && entry.endsWith(".json")) {
        // Top-level JSON file → raw_files
        try {
          const content = readFileSync(entryPath, "utf-8");
          insertRaw.run(entry, content);
          rawCount++;
        } catch (err) {
          console.warn(`[migrate] Skipped file: ${entry}`, err);
        }
      }
    }
  });

  insertMany();

  console.log(`[migrate] Done. Imported ${kvCount} collection items, ${rawCount} raw files.`);
  console.log(`[migrate] Database: ${dbPath}`);
  db.close();
}

main();
