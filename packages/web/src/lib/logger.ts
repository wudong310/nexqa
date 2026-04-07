const LEVEL_LABELS = ["debug", "info", "warn", "error"] as const;
type Level = (typeof LEVEL_LABELS)[number];

const STYLES: Record<Level, string> = {
  debug: "color: gray",
  info: "color: dodgerblue",
  warn: "color: orange",
  error: "color: red; font-weight: bold",
};

let _traceId = genTraceId();

function genTraceId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function getTraceId(): string {
  return _traceId;
}

function refreshTraceId(): string {
  _traceId = genTraceId();
  return _traceId;
}

function createLogger(scope: string) {
  function log(level: Level, msg: string, data?: unknown) {
    const ts = new Date().toISOString().slice(11, 23);
    const tid = _traceId;
    const prefix = `%c[${ts}] [${level.toUpperCase()}] [${scope}] [${tid}]`;
    if (data !== undefined) {
      console[level](prefix, STYLES[level], msg, data);
    } else {
      console[level](prefix, STYLES[level], msg);
    }
  }

  return {
    debug: (msg: string, data?: unknown) => log("debug", msg, data),
    info: (msg: string, data?: unknown) => log("info", msg, data),
    warn: (msg: string, data?: unknown) => log("warn", msg, data),
    error: (msg: string, data?: unknown) => log("error", msg, data),
  };
}

export { createLogger, getTraceId, refreshTraceId };
