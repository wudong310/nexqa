import type { Endpoint } from "@nexqa/shared";
import YAML from "yaml";

export type ApiFormat =
  | "openapi3"
  | "swagger2"
  | "postman-v2"
  | "har"
  | "curl"
  | "unknown";

export interface ParseResult {
  format: ApiFormat;
  endpoints: Endpoint[];
  errors?: string[];
}

// ─── Format Detection ────────────────────────────────────────────

export function detectFormat(content: string): ApiFormat {
  const trimmed = content.trim();

  // Try JSON first
  try {
    const json = JSON.parse(trimmed);
    return detectFormatFromObject(json);
  } catch {
    // not JSON
  }

  // Try YAML
  try {
    const doc = YAML.parse(trimmed);
    if (doc && typeof doc === "object") {
      return detectFormatFromObject(doc);
    }
  } catch {
    // not YAML
  }

  // cURL
  if (/^curl\s/i.test(trimmed)) return "curl";

  return "unknown";
}

function detectFormatFromObject(obj: Record<string, unknown>): ApiFormat {
  if (
    typeof obj.openapi === "string" &&
    (obj.openapi as string).startsWith("3.")
  )
    return "openapi3";
  if (obj.swagger === "2.0") return "swagger2";

  // Postman: info.schema contains getpostman.com
  const info = obj.info as Record<string, unknown> | undefined;
  if (
    info &&
    typeof info.schema === "string" &&
    (info.schema as string).includes("getpostman.com")
  )
    return "postman-v2";

  // HAR
  const log = obj.log as Record<string, unknown> | undefined;
  if (log && Array.isArray(log.entries)) return "har";

  return "unknown";
}

// ─── Unified Entry ───────────────────────────────────────────────

export function parseApiDocument(content: string): ParseResult {
  const format = detectFormat(content);

  if (format === "unknown") {
    return { format, endpoints: [], errors: ["无法识别的格式"] };
  }

  const errors: string[] = [];

  try {
    let endpoints: Endpoint[];

    switch (format) {
      case "openapi3":
        endpoints = parseOpenApi3(content);
        break;
      case "swagger2":
        endpoints = parseSwagger2(content);
        break;
      case "postman-v2":
        endpoints = parsePostmanV2(content);
        break;
      case "har":
        endpoints = parseHar(content);
        break;
      case "curl":
        endpoints = parseCurl(content);
        break;
      default:
        endpoints = [];
    }

    return { format, endpoints, ...(errors.length > 0 ? { errors } : {}) };
  } catch (err) {
    return {
      format,
      endpoints: [],
      errors: [
        `解析失败: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

const VALID_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

function normalizeMethod(
  m: string,
): "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" {
  const upper = m.toUpperCase();
  if (VALID_METHODS.has(upper)) return upper as Endpoint["method"];
  return "GET";
}

function smartParse(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return YAML.parse(trimmed) as Record<string, unknown>;
  }
}

// ─── OpenAPI 3.x ─────────────────────────────────────────────────

function parseOpenApi3(content: string): Endpoint[] {
  const doc = smartParse(content);
  const paths = doc.paths as Record<
    string,
    Record<string, unknown>
  > | undefined;
  if (!paths) return [];

  const endpoints: Endpoint[] = [];

  for (const [path, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== "object") continue;

    for (const [method, operation] of Object.entries(methods)) {
      if (!VALID_METHODS.has(method.toUpperCase())) continue;
      const op = operation as Record<string, unknown>;

      const endpoint: Endpoint = {
        method: normalizeMethod(method),
        path,
        summary: (op.summary as string) || (op.description as string) || "",
        headers: [],
        queryParams: [],
        pathParams: [],
        responses: [],
        confidence: "high",
      };

      // Parameters
      const params = (op.parameters || []) as Array<Record<string, unknown>>;
      for (const p of params) {
        const param = {
          name: (p.name as string) || "",
          type: ((p.schema as Record<string, unknown>)?.type as string) || "string",
          required: Boolean(p.required),
          description: (p.description as string) || "",
          example: p.example,
        };
        switch (p.in) {
          case "header":
            endpoint.headers.push(param);
            break;
          case "query":
            endpoint.queryParams.push(param);
            break;
          case "path":
            endpoint.pathParams.push({ ...param, required: true });
            break;
        }
      }

      // Request body
      const reqBody = op.requestBody as Record<string, unknown> | undefined;
      if (reqBody) {
        const bodyContent = reqBody.content as
          | Record<string, Record<string, unknown>>
          | undefined;
        if (bodyContent) {
          const contentType = Object.keys(bodyContent)[0] || "application/json";
          const mediaType = bodyContent[contentType];
          endpoint.body = {
            contentType,
            schema: mediaType?.schema,
            example: mediaType?.example,
          };
        }
      }

      // Responses
      const resps = op.responses as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (resps) {
        for (const [status, resp] of Object.entries(resps)) {
          const statusNum = Number.parseInt(status, 10);
          if (!Number.isNaN(statusNum)) {
            endpoint.responses.push({
              status: statusNum,
              description: (resp.description as string) || "",
            });
          }
        }
      }

      endpoints.push(endpoint);
    }
  }

  return endpoints;
}

// ─── Swagger 2.0 ─────────────────────────────────────────────────

function parseSwagger2(content: string): Endpoint[] {
  const doc = smartParse(content);
  const paths = doc.paths as Record<
    string,
    Record<string, unknown>
  > | undefined;
  if (!paths) return [];

  const globalConsumes = (doc.consumes as string[]) || [];
  const endpoints: Endpoint[] = [];

  for (const [path, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== "object") continue;

    for (const [method, operation] of Object.entries(methods)) {
      if (!VALID_METHODS.has(method.toUpperCase())) continue;
      const op = operation as Record<string, unknown>;

      const endpoint: Endpoint = {
        method: normalizeMethod(method),
        path,
        summary: (op.summary as string) || (op.description as string) || "",
        headers: [],
        queryParams: [],
        pathParams: [],
        responses: [],
        confidence: "high",
      };

      const params = (op.parameters || []) as Array<Record<string, unknown>>;
      for (const p of params) {
        if (p.in === "body") {
          // Swagger 2.0 body parameter
          const consumes =
            (op.consumes as string[]) || globalConsumes;
          endpoint.body = {
            contentType: consumes[0] || "application/json",
            schema: p.schema,
            example: p.example ?? (p.schema as Record<string, unknown>)?.example,
          };
          continue;
        }

        const param = {
          name: (p.name as string) || "",
          type: (p.type as string) || "string",
          required: Boolean(p.required),
          description: (p.description as string) || "",
          example: p.example,
        };
        switch (p.in) {
          case "header":
            endpoint.headers.push(param);
            break;
          case "query":
            endpoint.queryParams.push(param);
            break;
          case "path":
            endpoint.pathParams.push({ ...param, required: true });
            break;
        }
      }

      // Responses
      const resps = op.responses as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (resps) {
        for (const [status, resp] of Object.entries(resps)) {
          const statusNum = Number.parseInt(status, 10);
          if (!Number.isNaN(statusNum)) {
            endpoint.responses.push({
              status: statusNum,
              description: (resp.description as string) || "",
            });
          }
        }
      }

      endpoints.push(endpoint);
    }
  }

  return endpoints;
}

// ─── Postman Collection v2.x ─────────────────────────────────────

function parsePostmanV2(content: string): Endpoint[] {
  const doc = JSON.parse(content.trim()) as Record<string, unknown>;
  const items = doc.item as Array<Record<string, unknown>> | undefined;
  if (!items) return [];

  const endpoints: Endpoint[] = [];
  collectPostmanItems(items, endpoints);
  return endpoints;
}

function collectPostmanItems(
  items: Array<Record<string, unknown>>,
  endpoints: Endpoint[],
): void {
  for (const item of items) {
    // Nested folders
    if (Array.isArray(item.item)) {
      collectPostmanItems(
        item.item as Array<Record<string, unknown>>,
        endpoints,
      );
      continue;
    }

    const request = item.request as Record<string, unknown> | undefined;
    if (!request) continue;

    const method = normalizeMethod(
      typeof request.method === "string" ? request.method : "GET",
    );

    // URL
    let path = "/";
    const url = request.url;
    if (typeof url === "string") {
      path = extractPathFromUrl(url);
    } else if (url && typeof url === "object") {
      const urlObj = url as Record<string, unknown>;
      if (typeof urlObj.raw === "string") {
        path = extractPathFromUrl(urlObj.raw);
      } else if (Array.isArray(urlObj.path)) {
        path = `/${(urlObj.path as string[]).join("/")}`;
      }
    }

    const endpoint: Endpoint = {
      method,
      path,
      summary: (item.name as string) || "",
      headers: [],
      queryParams: [],
      pathParams: [],
      responses: [],
      confidence: "medium",
    };

    // Headers
    const headers = request.header as
      | Array<Record<string, unknown>>
      | undefined;
    if (Array.isArray(headers)) {
      for (const h of headers) {
        endpoint.headers.push({
          name: (h.key as string) || "",
          type: "string",
          required: false,
          description: (h.description as string) || "",
        });
      }
    }

    // Query params from URL
    if (url && typeof url === "object") {
      const urlObj = url as Record<string, unknown>;
      const query = urlObj.query as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(query)) {
        for (const q of query) {
          endpoint.queryParams.push({
            name: (q.key as string) || "",
            type: "string",
            required: false,
            description: (q.description as string) || "",
          });
        }
      }
    }

    // Body
    const body = request.body as Record<string, unknown> | undefined;
    if (body) {
      const mode = body.mode as string;
      let example: unknown = undefined;
      if (mode === "raw" && typeof body.raw === "string") {
        try {
          example = JSON.parse(body.raw);
        } catch {
          example = body.raw;
        }
      }
      endpoint.body = {
        contentType:
          mode === "raw" ? "application/json" : `application/${mode || "json"}`,
        example,
      };
    }

    endpoints.push(endpoint);
  }
}

function extractPathFromUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return u.pathname || "/";
  } catch {
    // Not a full URL, might be just a path or have variables
    const match = raw.match(/(?:https?:\/\/[^/]*)?(\/.*)$/);
    if (match) {
      // Strip query string
      return match[1].split("?")[0];
    }
    return `/${raw}`;
  }
}

// ─── HAR (HTTP Archive) ─────────────────────────────────────────

function parseHar(content: string): Endpoint[] {
  const doc = JSON.parse(content.trim()) as Record<string, unknown>;
  const log = doc.log as Record<string, unknown> | undefined;
  if (!log) return [];
  const entries = log.entries as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(entries)) return [];

  const endpoints: Endpoint[] = [];
  // Deduplicate by method+path
  const seen = new Set<string>();

  for (const entry of entries) {
    const request = entry.request as Record<string, unknown> | undefined;
    if (!request) continue;

    const method = normalizeMethod((request.method as string) || "GET");
    const rawUrl = (request.url as string) || "";
    const path = extractPathFromUrl(rawUrl);

    const key = `${method} ${path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const endpoint: Endpoint = {
      method,
      path,
      summary: "",
      headers: [],
      queryParams: [],
      pathParams: [],
      responses: [],
      confidence: "medium",
    };

    // Headers
    const headers = request.headers as
      | Array<Record<string, unknown>>
      | undefined;
    if (Array.isArray(headers)) {
      for (const h of headers) {
        const name = (h.name as string) || "";
        // Skip pseudo-headers and common browser headers
        if (
          name.startsWith(":") ||
          ["host", "connection", "accept-encoding", "user-agent"].includes(
            name.toLowerCase(),
          )
        )
          continue;
        endpoint.headers.push({
          name,
          type: "string",
          required: false,
          description: "",
        });
      }
    }

    // Query params from queryString
    const queryString = request.queryString as
      | Array<Record<string, unknown>>
      | undefined;
    if (Array.isArray(queryString)) {
      for (const q of queryString) {
        endpoint.queryParams.push({
          name: (q.name as string) || "",
          type: "string",
          required: false,
          description: "",
        });
      }
    }

    // Body
    const postData = request.postData as Record<string, unknown> | undefined;
    if (postData && postData.text) {
      let example: unknown = undefined;
      try {
        example = JSON.parse(postData.text as string);
      } catch {
        example = postData.text;
      }
      endpoint.body = {
        contentType: (postData.mimeType as string) || "application/json",
        example,
      };
    }

    // Response status
    const response = entry.response as Record<string, unknown> | undefined;
    if (response && typeof response.status === "number") {
      endpoint.responses.push({
        status: response.status as number,
        description: (response.statusText as string) || "",
      });
    }

    endpoints.push(endpoint);
  }

  return endpoints;
}

// ─── cURL ────────────────────────────────────────────────────────

function parseCurl(content: string): Endpoint[] {
  // Normalize multiline continuation
  const normalized = content.trim().replace(/\\\s*\n\s*/g, " ");

  // May contain multiple curl commands
  const commands = normalized
    .split(/\n/)
    .filter((line) => /^curl\s/i.test(line.trim()));

  if (commands.length === 0 && /^curl\s/i.test(normalized)) {
    commands.push(normalized);
  }

  const endpoints: Endpoint[] = [];

  for (const cmd of commands) {
    const endpoint = parseSingleCurl(cmd);
    if (endpoint) endpoints.push(endpoint);
  }

  return endpoints;
}

function parseSingleCurl(cmd: string): Endpoint | null {
  // Extract method (-X / --request)
  const methodMatch = cmd.match(/-X\s+(\w+)|--request\s+(\w+)/);
  let method = methodMatch
    ? normalizeMethod(methodMatch[1] || methodMatch[2])
    : "GET";

  // Extract URL - handle both quoted and unquoted
  const urlMatch = cmd.match(
    /curl\s+(?:.*?\s+)?['"]?(https?:\/\/[^\s'"]+)['"]?/,
  );
  let path = "/";
  if (urlMatch) {
    path = extractPathFromUrl(urlMatch[1]);
  }

  // Extract headers (-H / --header)
  const headers: Endpoint["headers"] = [];
  const headerRegex = /(?:-H|--header)\s+['"]([^'"]+)['"]/g;
  let hMatch: RegExpExecArray | null;
  while ((hMatch = headerRegex.exec(cmd)) !== null) {
    const [name, ...valueParts] = hMatch[1].split(":");
    if (name) {
      headers.push({
        name: name.trim(),
        type: "string",
        required: false,
        description: valueParts.join(":").trim(),
      });
    }
  }

  // Extract body (-d / --data / --data-raw / --data-binary)
  let body: Endpoint["body"] = undefined;
  const dataMatch = cmd.match(
    /(?:-d|--data|--data-raw|--data-binary)\s+'([^']*)'|(?:-d|--data|--data-raw|--data-binary)\s+"([^"]*)"/,
  );
  if (dataMatch) {
    const rawBody = dataMatch[1] ?? dataMatch[2] ?? "";
    let example: unknown = undefined;
    try {
      example = JSON.parse(rawBody);
    } catch {
      example = rawBody;
    }
    body = {
      contentType: "application/json",
      example,
    };

    // If body present but method still GET, switch to POST
    if (method === "GET") {
      method = "POST";
    }
  }

  return {
    method,
    path,
    summary: "",
    headers,
    queryParams: [],
    pathParams: [],
    responses: [],
    body,
    confidence: "medium",
  };
}
