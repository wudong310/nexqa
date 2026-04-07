import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LEVEL_LABELS = ["DEBUG", "INFO", "WARN", "ERROR"] as const;
type Level = (typeof LEVEL_LABELS)[number];

const COLORS: Record<Level, string> = {
  DEBUG: "\x1b[90m",
  INFO: "\x1b[36m",
  WARN: "\x1b[33m",
  ERROR: "\x1b[31m",
};
const RESET = "\x1b[0m";

const DEFAULT_LOG_DIR = join(homedir(), "Logs", "api-test");
const SETTINGS_PATH = join(homedir(), "Datas", "api-test", "settings.json");

function readSettings(): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function getLogDir(): string {
  const s = readSettings();
  if (s?.storage && typeof s.storage === "object") {
    const st = s.storage as Record<string, unknown>;
    if (typeof st.logDir === "string" && st.logDir) return st.logDir;
  }
  return DEFAULT_LOG_DIR;
}

function getDefaultLogDir(): string {
  return DEFAULT_LOG_DIR;
}

function dateTag(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true });
}

function writeToFile(file: string, line: string) {
  try {
    appendFileSync(file, `${line}\n`);
  } catch {}
}

function writeLog(
  prefix: string,
  level: Level | string,
  line: string,
  isError: boolean,
) {
  const logDir = getLogDir();
  ensureDir(logDir);
  const day = dateTag();
  writeToFile(join(logDir, `${prefix}-${day}.log`), line);
  if (isError) {
    writeToFile(join(logDir, `${prefix}-error-${day}.log`), line);
  }
}

function formatPlain(
  level: Level,
  scope: string,
  traceId: string | undefined,
  msg: string,
  data?: unknown,
) {
  const ts = new Date().toISOString();
  const tid = traceId ? ` [${traceId}]` : "";
  const base = `[${ts}] [${level}] [${scope}]${tid} ${msg}`;
  if (data !== undefined) {
    const str = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return `${base}\n${str}`;
  }
  return base;
}

function formatConsole(
  level: Level,
  scope: string,
  traceId: string | undefined,
  msg: string,
  data?: unknown,
) {
  const ts = new Date().toISOString();
  const color = COLORS[level];
  const tid = traceId ? ` [${traceId}]` : "";
  const base = `${color}[${ts}] [${level}] [${scope}]${tid}${RESET} ${msg}`;
  if (data !== undefined) {
    const str = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return `${base}\n${str}`;
  }
  return base;
}

function log(
  level: Level,
  scope: string,
  traceId: string | undefined,
  msg: string,
  data?: unknown,
) {
  const consoleLine = formatConsole(level, scope, traceId, msg, data);
  const fileLine = formatPlain(level, scope, traceId, msg, data);

  const method =
    level === "DEBUG"
      ? "debug"
      : level === "INFO"
        ? "info"
        : level === "WARN"
          ? "warn"
          : "error";
  console[method](consoleLine);

  writeLog("server", level, fileLine, level === "ERROR" || level === "WARN");
}

function createLogger(scope: string, traceId?: string) {
  return {
    debug: (msg: string, data?: unknown) =>
      log("DEBUG", scope, traceId, msg, data),
    info: (msg: string, data?: unknown) =>
      log("INFO", scope, traceId, msg, data),
    warn: (msg: string, data?: unknown) =>
      log("WARN", scope, traceId, msg, data),
    error: (msg: string, data?: unknown) =>
      log("ERROR", scope, traceId, msg, data),
    child: (childScope: string) =>
      createLogger(`${scope}:${childScope}`, traceId),
    withTraceId: (tid: string) => createLogger(scope, tid),
  };
}

function writeClientLog(
  level: string,
  scope: string,
  traceId: string | undefined,
  msg: string,
  data?: unknown,
) {
  const ts = new Date().toISOString();
  const tid = traceId ? ` [${traceId}]` : "";
  const dataStr =
    data !== undefined
      ? `\n${typeof data === "string" ? data : JSON.stringify(data, null, 2)}`
      : "";
  const line = `[${ts}] [${level}] [client:${scope}]${tid} ${msg}${dataStr}`;
  const isError = level === "ERROR" || level === "WARN";
  writeLog("client", level, line, isError);
}

export { createLogger, writeClientLog, getDefaultLogDir, getLogDir };
