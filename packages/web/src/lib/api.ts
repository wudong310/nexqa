import { createLogger, getTraceId } from "./logger";

const log = createLogger("api");
const API_BASE = "/nexqa/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const method = options?.method || "GET";
  const traceId = getTraceId();
  log.debug(`${method} ${path}`);
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-trace-id": traceId,
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    log.error(
      `${method} ${path} -> ${res.status}`,
      error.error || res.statusText,
    );
    throw new Error(error.error || res.statusText);
  }
  log.debug(`${method} ${path} -> ${res.status}`);
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
};
