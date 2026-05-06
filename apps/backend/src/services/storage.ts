import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";

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

function getDefaultDataDir(): string {
  return DEFAULT_DATA_DIR;
}

// ── SQLite Database Singleton ─────────────────────────────────────────────

let _db: BetterSqlite3.Database | null = null;

function getDb(): BetterSqlite3.Database {
  if (_db) return _db;

  const dataDir = getDataDir();
  mkdirSync(dataDir, { recursive: true });

  const dbPath = join(dataDir, DB_FILENAME);
  _db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  _db.pragma("journal_mode = WAL");

  // Create tables
  _db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
  `);

  _db.exec(`
    CREATE TABLE IF NOT EXISTS raw_files (
      path TEXT PRIMARY KEY,
      content TEXT NOT NULL
    );
  `);

  return _db;
}

// ── Prepared Statements (lazy-initialized) ────────────────────────────────

let _stmts: {
  read: BetterSqlite3.Statement;
  write: BetterSqlite3.Statement;
  list: BetterSqlite3.Statement;
  remove: BetterSqlite3.Statement;
  readRaw: BetterSqlite3.Statement;
  writeRaw: BetterSqlite3.Statement;
} | null = null;

function getStmts() {
  if (_stmts) return _stmts;
  const db = getDb();
  _stmts = {
    read: db.prepare("SELECT data FROM kv_store WHERE collection = ? AND id = ?"),
    write: db.prepare(
      "INSERT OR REPLACE INTO kv_store (collection, id, data) VALUES (?, ?, ?)",
    ),
    list: db.prepare("SELECT data FROM kv_store WHERE collection = ?"),
    remove: db.prepare("DELETE FROM kv_store WHERE collection = ? AND id = ?"),
    readRaw: db.prepare("SELECT content FROM raw_files WHERE path = ?"),
    writeRaw: db.prepare(
      "INSERT OR REPLACE INTO raw_files (path, content) VALUES (?, ?)",
    ),
  };
  return _stmts;
}

// ── Storage API ───────────────────────────────────────────────────────────

export const storage = {
  async read<T>(collection: string, id: string): Promise<T | null> {
    try {
      const row = getStmts().read.get(collection, id) as
        | { data: string }
        | undefined;
      if (!row) return null;
      return JSON.parse(row.data) as T;
    } catch {
      return null;
    }
  },

  async write<T>(collection: string, id: string, data: T): Promise<void> {
    getStmts().write.run(collection, id, JSON.stringify(data));
  },

  async list<T>(collection: string): Promise<T[]> {
    try {
      const rows = getStmts().list.all(collection) as { data: string }[];
      return rows.map((row) => JSON.parse(row.data) as T);
    } catch {
      return [];
    }
  },

  async remove(collection: string, id: string): Promise<boolean> {
    try {
      const result = getStmts().remove.run(collection, id);
      return result.changes > 0;
    } catch {
      return false;
    }
  },

  async readRaw(relativePath: string): Promise<string | null> {
    try {
      const row = getStmts().readRaw.get(relativePath) as
        | { content: string }
        | undefined;
      if (!row) return null;
      return row.content;
    } catch {
      return null;
    }
  },

  async writeRaw(relativePath: string, content: string): Promise<void> {
    getStmts().writeRaw.run(relativePath, content);
  },
};

export { getDefaultDataDir, getDataDir };
