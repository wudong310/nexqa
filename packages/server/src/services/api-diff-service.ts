/**
 * API Diff Service — 自研简易 diff（对比两个 OpenAPI JSON，识别新增/删除/修改端点）
 * 降级方案：oasdiff 未安装时使用自研 diff
 */

// ── Types ─────────────────────────────────────────────

export interface EndpointChange {
  path: string;
  method: string;
  description?: string;
}

export interface FieldChange {
  field: string;
  type: "added" | "removed" | "modified";
  detail: string;
  breaking: boolean;
}

export interface EndpointModification {
  path: string;
  method: string;
  changes: FieldChange[];
  severity: "breaking" | "non-breaking" | "info";
}

export interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
  breaking: number;
}

export interface ApiDiffResult {
  summary: DiffSummary;
  added: EndpointChange[];
  removed: EndpointChange[];
  modified: EndpointModification[];
}

// ── OpenAPI parsing helpers ───────────────────────────

interface ParsedEndpoint {
  method: string;
  path: string;
  summary?: string;
  parameters?: any[];
  requestBody?: any;
  responses?: Record<string, any>;
}

function extractEndpoints(spec: any): Map<string, ParsedEndpoint> {
  const endpoints = new Map<string, ParsedEndpoint>();
  const paths = spec.paths || {};

  for (const [path, methods] of Object.entries(paths as Record<string, any>)) {
    if (!methods || typeof methods !== "object") continue;
    for (const [method, operation] of Object.entries(methods)) {
      if (["get", "post", "put", "patch", "delete", "head", "options"].includes(method.toLowerCase())) {
        const op = operation as any;
        const key = `${method.toUpperCase()} ${path}`;
        endpoints.set(key, {
          method: method.toUpperCase(),
          path,
          summary: op.summary || op.description || "",
          parameters: op.parameters || [],
          requestBody: op.requestBody,
          responses: op.responses || {},
        });
      }
    }
  }
  return endpoints;
}

// ── Field-level diff ──────────────────────────────────

function diffRequestBody(oldOp: ParsedEndpoint, newOp: ParsedEndpoint): FieldChange[] {
  const changes: FieldChange[] = [];
  const oldSchema = getRequestSchema(oldOp);
  const newSchema = getRequestSchema(newOp);

  if (!oldSchema && !newSchema) return changes;
  if (!oldSchema && newSchema) {
    changes.push({ field: "requestBody", type: "added", detail: "新增请求体", breaking: false });
    return changes;
  }
  if (oldSchema && !newSchema) {
    changes.push({ field: "requestBody", type: "removed", detail: "移除请求体", breaking: true });
    return changes;
  }

  // Compare properties
  const oldProps = getSchemaProperties(oldSchema);
  const newProps = getSchemaProperties(newSchema);
  const oldRequired = new Set<string>((oldSchema?.required as string[]) || []);
  const newRequired = new Set<string>((newSchema?.required as string[]) || []);

  // Find added properties
  for (const [name, prop] of Object.entries(newProps)) {
    if (!(name in oldProps)) {
      const isRequired = newRequired.has(name);
      changes.push({
        field: `requestBody.${name}`,
        type: "added",
        detail: `新增${isRequired ? "必填" : "可选"}请求字段 '${name}'`,
        breaking: isRequired, // new required field is breaking
      });
    }
  }

  // Find removed properties
  for (const name of Object.keys(oldProps)) {
    if (!(name in newProps)) {
      changes.push({
        field: `requestBody.${name}`,
        type: "removed",
        detail: `移除请求字段 '${name}'`,
        breaking: false,
      });
    }
  }

  // Check required changes
  for (const name of newRequired) {
    if (!oldRequired.has(name) && name in oldProps) {
      changes.push({
        field: `requestBody.${name}`,
        type: "modified",
        detail: `字段 '${name}' 变为必填`,
        breaking: true,
      });
    }
  }

  return changes;
}

function diffResponses(oldOp: ParsedEndpoint, newOp: ParsedEndpoint): FieldChange[] {
  const changes: FieldChange[] = [];
  const oldResponses = oldOp.responses || {};
  const newResponses = newOp.responses || {};

  for (const [status, resp] of Object.entries(newResponses)) {
    if (!(status in oldResponses)) {
      changes.push({
        field: `response.${status}`,
        type: "added",
        detail: `新增响应状态码 ${status}`,
        breaking: false,
      });
      continue;
    }

    // Compare response schemas
    const oldRespSchema = getResponseSchema(oldResponses[status]);
    const newRespSchema = getResponseSchema(resp);
    if (oldRespSchema && newRespSchema) {
      const oldRespProps = getSchemaProperties(oldRespSchema);
      const newRespProps = getSchemaProperties(newRespSchema);

      for (const name of Object.keys(newRespProps)) {
        if (!(name in oldRespProps)) {
          changes.push({
            field: `response.${status}.${name}`,
            type: "added",
            detail: `响应新增字段 '${name}'`,
            breaking: false,
          });
        }
      }

      for (const name of Object.keys(oldRespProps)) {
        if (!(name in newRespProps)) {
          changes.push({
            field: `response.${status}.${name}`,
            type: "removed",
            detail: `响应移除字段 '${name}'`,
            breaking: true, // removing response field can break consumers
          });
        }
      }
    }
  }

  for (const status of Object.keys(oldResponses)) {
    if (!(status in newResponses)) {
      changes.push({
        field: `response.${status}`,
        type: "removed",
        detail: `移除响应状态码 ${status}`,
        breaking: true,
      });
    }
  }

  return changes;
}

function diffParameters(oldOp: ParsedEndpoint, newOp: ParsedEndpoint): FieldChange[] {
  const changes: FieldChange[] = [];
  const oldParams = new Map((oldOp.parameters || []).map((p: any) => [`${p.in}.${p.name}`, p]));
  const newParams = new Map((newOp.parameters || []).map((p: any) => [`${p.in}.${p.name}`, p]));

  for (const [key, param] of newParams) {
    if (!oldParams.has(key)) {
      changes.push({
        field: `parameter.${key}`,
        type: "added",
        detail: `新增${(param as any).required ? "必填" : "可选"}参数 '${(param as any).name}'`,
        breaking: (param as any).required ?? false,
      });
    }
  }

  for (const [key, param] of oldParams) {
    if (!newParams.has(key)) {
      changes.push({
        field: `parameter.${key}`,
        type: "removed",
        detail: `移除参数 '${(param as any).name}'`,
        breaking: false,
      });
    }
  }

  return changes;
}

// ── Schema helpers ────────────────────────────────────

function getRequestSchema(op: ParsedEndpoint): any | null {
  if (!op.requestBody) return null;
  const content = op.requestBody.content || {};
  const json = content["application/json"];
  return json?.schema || null;
}

function getResponseSchema(response: any): any | null {
  if (!response) return null;
  const content = response.content || {};
  const json = content["application/json"];
  return json?.schema || null;
}

function getSchemaProperties(schema: any): Record<string, any> {
  if (!schema) return {};
  // Handle $ref resolution would be here in a full implementation
  return schema.properties || {};
}

// ── Main diff function ────────────────────────────────

export function diffOpenApiSpecs(oldSpec: any, newSpec: any): ApiDiffResult {
  const oldEndpoints = extractEndpoints(oldSpec);
  const newEndpoints = extractEndpoints(newSpec);

  const added: EndpointChange[] = [];
  const removed: EndpointChange[] = [];
  const modified: EndpointModification[] = [];

  // Find added endpoints
  for (const [key, ep] of newEndpoints) {
    if (!oldEndpoints.has(key)) {
      added.push({ path: ep.path, method: ep.method, description: ep.summary });
    }
  }

  // Find removed endpoints
  for (const [key, ep] of oldEndpoints) {
    if (!newEndpoints.has(key)) {
      removed.push({ path: ep.path, method: ep.method, description: ep.summary });
    }
  }

  // Find modified endpoints
  for (const [key, newEp] of newEndpoints) {
    const oldEp = oldEndpoints.get(key);
    if (!oldEp) continue;

    const changes: FieldChange[] = [
      ...diffRequestBody(oldEp, newEp),
      ...diffResponses(oldEp, newEp),
      ...diffParameters(oldEp, newEp),
    ];

    if (changes.length > 0) {
      const hasBreaking = changes.some((c) => c.breaking);
      modified.push({
        path: newEp.path,
        method: newEp.method,
        changes,
        severity: hasBreaking ? "breaking" : "non-breaking",
      });
    }
  }

  const breakingCount = modified.filter((m) => m.severity === "breaking").length + removed.length;

  return {
    summary: {
      added: added.length,
      removed: removed.length,
      modified: modified.length,
      breaking: breakingCount,
    },
    added,
    removed,
    modified,
  };
}

/**
 * Parse OpenAPI spec from string (JSON or YAML-like JSON).
 * For simplicity, only supports JSON format.
 */
export function parseOpenApiSpec(content: string): any {
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("Invalid OpenAPI spec: only JSON format is supported");
  }
}
