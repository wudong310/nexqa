/**
 * API 文档变更检测服务 — 基于端点的 diff 算法
 * 以 method+path 为唯一键，检测新增/删除/修改的端点
 */

import type {
  ApiDocument,
  ApiEndpoint,
  Endpoint,
  FieldChange,
  Param,
  TestCase,
} from "@nexqa/shared";
import { storage } from "./storage.js";

const TC_COLLECTION = "test-cases";

// ── Types ─────────────────────────────────────────────

export interface EndpointChange {
  tempId: string;
  endpoint: Endpoint;
  description?: string;
}

export interface EndpointModification {
  endpointId: string;
  endpoint: Endpoint;
  changes: FieldChange[];
  severity: "breaking" | "non-breaking" | "info";
}

export interface AffectedCase {
  testCaseId: string;
  testCaseName: string;
  endpointKey: string;
  impactType: "modified" | "deleted";
}

export interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
  breaking: number;
}

export interface ApiDocumentDiffResult {
  documentId: string;
  documentName: string;
  summary: DiffSummary;
  added: EndpointChange[];
  removed: EndpointChange[];
  modified: EndpointModification[];
  affectedCases: AffectedCase[];
}

// ── Core ──────────────────────────────────────────────

export function getEndpointKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

/**
 * 对比现有端点与新解析的端点，返回 diff 结果
 */
export async function diffEndpoints(
  existing: ApiEndpoint[],
  incoming: Endpoint[],
  document: ApiDocument,
): Promise<ApiDocumentDiffResult> {
  const existingMap = new Map<string, ApiEndpoint>();
  for (const ep of existing) {
    existingMap.set(getEndpointKey(ep.method, ep.path), ep);
  }

  const added: EndpointChange[] = [];
  const removed: EndpointChange[] = [];
  const modified: EndpointModification[] = [];
  const visitedKeys = new Set<string>();

  // 检测新增和修改
  for (const ep of incoming) {
    const key = getEndpointKey(ep.method, ep.path);
    visitedKeys.add(key);
    const existingEp = existingMap.get(key);

    if (!existingEp) {
      added.push({
        tempId: `temp-${key}`,
        endpoint: ep,
        description: ep.summary,
      });
    } else {
      const changes = detectFieldChanges(existingEp, ep);
      if (changes.length > 0) {
        const hasBreaking = changes.some((c) => c.breaking);
        modified.push({
          endpointId: existingEp.id,
          endpoint: ep,
          changes,
          severity: hasBreaking ? "breaking" : "non-breaking",
        });
      }
    }
  }

  // 剩余的是删除的
  for (const [key, ep] of existingMap) {
    if (!visitedKeys.has(key)) {
      removed.push({
        tempId: `removed-${key}`,
        endpoint: {
          method: ep.method,
          path: ep.path,
          summary: ep.summary,
          headers: ep.headers,
          queryParams: ep.queryParams,
          pathParams: ep.pathParams,
          body: ep.body,
          responses: ep.responses,
          confidence: "high",
        },
        description: ep.summary,
      });
    }
  }

  // 计算受影响用例
  const affectedCases = await findAffectedCases(existing, modified, removed);

  const breakingCount =
    modified.filter((m) => m.severity === "breaking").length + removed.length;

  return {
    documentId: document.id,
    documentName: document.name,
    summary: {
      added: added.length,
      removed: removed.length,
      modified: modified.length,
      breaking: breakingCount,
    },
    added,
    removed,
    modified,
    affectedCases,
  };
}

// ── Field-level diff ──────────────────────────────────

export function detectFieldChanges(
  oldEp: ApiEndpoint | Endpoint,
  newEp: Endpoint,
): FieldChange[] {
  const changes: FieldChange[] = [];

  // summary
  if (oldEp.summary !== newEp.summary) {
    changes.push({
      field: "summary",
      type: "modified",
      detail: `摘要变更: "${oldEp.summary}" → "${newEp.summary}"`,
      breaking: false,
    });
  }

  // queryParams
  changes.push(...diffParams(oldEp.queryParams, newEp.queryParams, "queryParam"));

  // headers
  changes.push(...diffParams(oldEp.headers, newEp.headers, "header"));

  // pathParams
  changes.push(...diffParams(oldEp.pathParams, newEp.pathParams, "pathParam"));

  // body
  if (oldEp.body || newEp.body) {
    changes.push(...diffBody(oldEp.body, newEp.body));
  }

  // responses
  changes.push(...diffResponses(oldEp.responses, newEp.responses));

  return changes;
}

function diffParams(
  oldParams: Param[],
  newParams: Param[],
  prefix: string,
): FieldChange[] {
  const changes: FieldChange[] = [];
  const oldMap = new Map(oldParams.map((p) => [p.name, p]));
  const newMap = new Map(newParams.map((p) => [p.name, p]));

  for (const [name, param] of newMap) {
    if (!oldMap.has(name)) {
      changes.push({
        field: `${prefix}.${name}`,
        type: "added",
        detail: `新增${param.required ? "必填" : "可选"}参数 '${name}'`,
        breaking: param.required,
      });
    } else {
      const oldParam = oldMap.get(name)!;
      if (!oldParam.required && param.required) {
        changes.push({
          field: `${prefix}.${name}`,
          type: "modified",
          detail: `参数 '${name}' 变为必填`,
          breaking: true,
        });
      }
      if (oldParam.type !== param.type) {
        changes.push({
          field: `${prefix}.${name}`,
          type: "modified",
          detail: `参数 '${name}' 类型变更: ${oldParam.type} → ${param.type}`,
          breaking: false,
        });
      }
    }
  }

  for (const [name] of oldMap) {
    if (!newMap.has(name)) {
      changes.push({
        field: `${prefix}.${name}`,
        type: "removed",
        detail: `移除参数 '${name}'`,
        breaking: false,
      });
    }
  }

  return changes;
}

function diffBody(
  oldBody: Endpoint["body"],
  newBody: Endpoint["body"],
): FieldChange[] {
  const changes: FieldChange[] = [];

  if (!oldBody && newBody) {
    changes.push({
      field: "body",
      type: "added",
      detail: "新增请求体",
      breaking: false,
    });
    return changes;
  }

  if (oldBody && !newBody) {
    changes.push({
      field: "body",
      type: "removed",
      detail: "移除请求体",
      breaking: true,
    });
    return changes;
  }

  if (oldBody && newBody) {
    if (oldBody.contentType !== newBody.contentType) {
      changes.push({
        field: "body.contentType",
        type: "modified",
        detail: `Content-Type 变更: ${oldBody.contentType} → ${newBody.contentType}`,
        breaking: false,
      });
    }

    // schema 深度对比（简化版：JSON.stringify 对比）
    const oldSchema = JSON.stringify(oldBody.schema);
    const newSchema = JSON.stringify(newBody.schema);
    if (oldSchema !== newSchema) {
      changes.push({
        field: "body.schema",
        type: "modified",
        detail: "请求体 Schema 变更",
        breaking: false,
      });
    }
  }

  return changes;
}

function diffResponses(
  oldResponses: Endpoint["responses"],
  newResponses: Endpoint["responses"],
): FieldChange[] {
  const changes: FieldChange[] = [];
  const oldMap = new Map(oldResponses.map((r) => [r.status, r]));
  const newMap = new Map(newResponses.map((r) => [r.status, r]));

  for (const [status] of newMap) {
    if (!oldMap.has(status)) {
      changes.push({
        field: `response.${status}`,
        type: "added",
        detail: `新增响应状态码 ${status}`,
        breaking: false,
      });
    }
  }

  for (const [status] of oldMap) {
    if (!newMap.has(status)) {
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

// ── Affected cases ────────────────────────────────────

async function findAffectedCases(
  existingEps: ApiEndpoint[],
  modified: EndpointModification[],
  removed: EndpointChange[],
): Promise<AffectedCase[]> {
  const allCases = await storage.list<TestCase>(TC_COLLECTION);
  const affected: AffectedCase[] = [];

  // 修改端点的关联用例
  for (const mod of modified) {
    const epId = mod.endpointId;
    const cases = allCases.filter((tc) => tc.endpointId === epId);
    for (const tc of cases) {
      affected.push({
        testCaseId: tc.id,
        testCaseName: tc.name,
        endpointKey: getEndpointKey(mod.endpoint.method, mod.endpoint.path),
        impactType: "modified",
      });
    }
  }

  // 删除端点的关联用例
  const removedKeys = new Set(removed.map((r) => getEndpointKey(r.endpoint.method, r.endpoint.path)));
  const epKeyToId = new Map<string, string>();
  for (const ep of existingEps) {
    epKeyToId.set(getEndpointKey(ep.method, ep.path), ep.id);
  }

  for (const key of removedKeys) {
    const epId = epKeyToId.get(key);
    if (!epId) continue;
    const cases = allCases.filter((tc) => tc.endpointId === epId);
    for (const tc of cases) {
      affected.push({
        testCaseId: tc.id,
        testCaseName: tc.name,
        endpointKey: key,
        impactType: "deleted",
      });
    }
  }

  return affected;
}
