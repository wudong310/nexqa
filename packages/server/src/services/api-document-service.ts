/**
 * API 文档管理服务 — CRUD + 导入逻辑
 */

import { createHash, randomUUID } from "node:crypto";
import type { ApiDocument, ApiEndpoint, Endpoint, TestCase } from "@nexqa/shared";
import type { ApiFormat } from "./api-parser.js";
import { parseApiDocument } from "./api-parser.js";
import { storage } from "./storage.js";

const DOC_COLLECTION = "api-documents";
const EP_COLLECTION = "api-endpoints";
const TC_COLLECTION = "test-cases";

// ── Helpers ───────────────────────────────────────────

export function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function getEndpointKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

// ── Document CRUD ─────────────────────────────────────

export async function listDocuments(projectId: string): Promise<ApiDocument[]> {
  const all = await storage.list<ApiDocument>(DOC_COLLECTION);
  return all
    .filter((d) => d.projectId === projectId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDocument(id: string): Promise<ApiDocument | null> {
  return storage.read<ApiDocument>(DOC_COLLECTION, id);
}

export async function deleteDocument(id: string): Promise<{ deletedEndpoints: string[]; affectedCases: string[] }> {
  const doc = await storage.read<ApiDocument>(DOC_COLLECTION, id);
  if (!doc) throw new Error("文档不存在");

  // 查找该文档下的所有端点
  const allEps = await storage.list<ApiEndpoint>(EP_COLLECTION);
  const docEps = allEps.filter((ep) => ep.documentId === id);
  const epIds = new Set(docEps.map((ep) => ep.id));

  // 查找关联的测试用例，清空 endpointId 并标记
  const allCases = await storage.list<TestCase>(TC_COLLECTION);
  const affectedCases: string[] = [];
  const now = new Date().toISOString();

  for (const tc of allCases) {
    if (tc.endpointId && epIds.has(tc.endpointId)) {
      const updated: TestCase = {
        ...tc,
        endpointId: null,
        apiChangeFlag: {
          changedAt: now,
          changeType: "deleted",
          documentId: id,
          documentName: doc.name,
        },
        updatedAt: now,
      };
      await storage.write(TC_COLLECTION, tc.id, updated);
      affectedCases.push(tc.id);
    }
  }

  // 删除端点
  for (const ep of docEps) {
    await storage.remove(EP_COLLECTION, ep.id);
  }

  // 删除文档
  await storage.remove(DOC_COLLECTION, id);

  return { deletedEndpoints: docEps.map((ep) => ep.id), affectedCases };
}

// ── Import ────────────────────────────────────────────

export interface ImportRequest {
  projectId: string;
  name?: string;
  content: string;
  source?: string;
  updateDocumentId?: string;
}

export interface ImportResult {
  isUpdate: boolean;
  document: ApiDocument;
  endpoints?: ApiEndpoint[];
  diff?: import("./api-document-diff-service.js").ApiDocumentDiffResult;
  parseResult?: {
    format: ApiFormat;
    endpointCount: number;
  };
}

export async function importDocument(req: ImportRequest): Promise<ImportResult> {
  const { projectId, content, source } = req;

  // 1. 解析文档
  const parseResult = parseApiDocument(content);
  if (parseResult.format === "unknown" || parseResult.endpoints.length === 0) {
    throw new Error(
      parseResult.errors?.join("; ") || "无法解析文档或无端点",
    );
  }

  const contentHash = computeContentHash(content);
  const name = req.name || `api-doc-${Date.now()}`;

  // 2. 如果指定了要更新的文档 → 走 diff 流程
  if (req.updateDocumentId) {
    const existingDoc = await storage.read<ApiDocument>(DOC_COLLECTION, req.updateDocumentId);
    if (!existingDoc) throw new Error("要更新的文档不存在");

    if (existingDoc.contentHash === contentHash) {
      return {
        isUpdate: true,
        document: existingDoc,
        parseResult: { format: parseResult.format, endpointCount: parseResult.endpoints.length },
      };
    }

    // 获取现有端点并 diff
    const allEps = await storage.list<ApiEndpoint>(EP_COLLECTION);
    const existingEps = allEps.filter((ep) => ep.documentId === req.updateDocumentId);

    const { diffEndpoints } = await import("./api-document-diff-service.js");
    const diff = await diffEndpoints(existingEps, parseResult.endpoints, existingDoc);

    return {
      isUpdate: true,
      document: existingDoc,
      diff,
      parseResult: { format: parseResult.format, endpointCount: parseResult.endpoints.length },
    };
  }

  // 3. 新文档 → 直接导入
  const now = new Date().toISOString();
  const doc: ApiDocument = {
    id: randomUUID(),
    projectId,
    name,
    format: parseResult.format as ApiDocument["format"],
    source: source || null,
    contentHash,
    endpointCount: parseResult.endpoints.length,
    createdAt: now,
    updatedAt: now,
  };
  await storage.write(DOC_COLLECTION, doc.id, doc);

  // 4. 创建端点
  const endpoints = await createEndpoints(projectId, doc.id, parseResult.endpoints);

  // 5. 自动关联：按 method+path 匹配现有未关联的用例
  await autoLinkTestCases(projectId, endpoints);

  return {
    isUpdate: false,
    document: doc,
    endpoints,
    parseResult: { format: parseResult.format, endpointCount: parseResult.endpoints.length },
  };
}

// ── Confirm Update ────────────────────────────────────

export interface ConfirmUpdateRequest {
  contentHash: string;
  content: string;
  acceptAdded: string[];
  acceptModified: string[];
  acceptRemoved: string[];
}

export interface ConfirmUpdateResult {
  updated: ApiEndpoint[];
  added: ApiEndpoint[];
  deleted: string[];
  affectedCases: Array<{ id: string; name: string; apiChangeFlag: TestCase["apiChangeFlag"] }>;
}

export async function confirmUpdate(
  documentId: string,
  req: ConfirmUpdateRequest,
): Promise<ConfirmUpdateResult> {
  const doc = await storage.read<ApiDocument>(DOC_COLLECTION, documentId);
  if (!doc) throw new Error("文档不存在");

  // 重新解析获取 incoming 端点
  const parseResult = parseApiDocument(req.content);
  if (parseResult.format === "unknown") throw new Error("无法解析文档");

  const allEps = await storage.list<ApiEndpoint>(EP_COLLECTION);
  const existingEps = allEps.filter((ep) => ep.documentId === documentId);
  const existingMap = new Map<string, ApiEndpoint>();
  for (const ep of existingEps) {
    existingMap.set(getEndpointKey(ep.method, ep.path), ep);
  }

  const incomingMap = new Map<string, Endpoint>();
  for (const ep of parseResult.endpoints) {
    incomingMap.set(getEndpointKey(ep.method, ep.path), ep);
  }

  const now = new Date().toISOString();
  const updated: ApiEndpoint[] = [];
  const added: ApiEndpoint[] = [];
  const deleted: string[] = [];
  const affectedCaseIds = new Set<string>();

  // 处理新增
  const acceptedAddedSet = new Set(req.acceptAdded);
  for (const ep of parseResult.endpoints) {
    const key = getEndpointKey(ep.method, ep.path);
    const tempId = `temp-${key}`;
    if (!existingMap.has(key) && acceptedAddedSet.has(tempId)) {
      const newEp: ApiEndpoint = {
        id: randomUUID(),
        projectId: doc.projectId,
        documentId,
        method: ep.method,
        path: ep.path,
        summary: ep.summary,
        headers: ep.headers,
        queryParams: ep.queryParams,
        pathParams: ep.pathParams,
        body: ep.body,
        responses: ep.responses,
        createdAt: now,
        updatedAt: now,
      };
      await storage.write(EP_COLLECTION, newEp.id, newEp);
      added.push(newEp);
    }
  }

  // 处理修改
  const acceptedModifiedSet = new Set(req.acceptModified);
  for (const ep of existingEps) {
    if (!acceptedModifiedSet.has(ep.id)) continue;
    const key = getEndpointKey(ep.method, ep.path);
    const incoming = incomingMap.get(key);
    if (!incoming) continue;

    const updatedEp: ApiEndpoint = {
      ...ep,
      summary: incoming.summary || ep.summary,
      headers: incoming.headers,
      queryParams: incoming.queryParams,
      pathParams: incoming.pathParams,
      body: incoming.body,
      responses: incoming.responses,
      updatedAt: now,
    };
    await storage.write(EP_COLLECTION, ep.id, updatedEp);
    updated.push(updatedEp);

    // 标记关联用例
    const cases = await getTestCasesByEndpointId(ep.id);
    for (const tc of cases) {
      affectedCaseIds.add(tc.id);
    }
  }

  // 处理删除
  const acceptedRemovedSet = new Set(req.acceptRemoved);
  for (const ep of existingEps) {
    if (!acceptedRemovedSet.has(ep.id)) continue;
    const key = getEndpointKey(ep.method, ep.path);
    if (incomingMap.has(key)) continue; // 还在新文档中，不是真的被删

    // 标记关联用例
    const cases = await getTestCasesByEndpointId(ep.id);
    for (const tc of cases) {
      const updatedTc: TestCase = {
        ...tc,
        endpointId: null,
        apiChangeFlag: {
          changedAt: now,
          changeType: "deleted",
          documentId,
          documentName: doc.name,
        },
        updatedAt: now,
      };
      await storage.write(TC_COLLECTION, tc.id, updatedTc);
      affectedCaseIds.add(tc.id);
    }

    await storage.remove(EP_COLLECTION, ep.id);
    deleted.push(ep.id);
  }

  // 标记修改端点的关联用例
  const { diffEndpoints } = await import("./api-document-diff-service.js");
  const diffResult = await diffEndpoints(existingEps, parseResult.endpoints, doc);

  for (const caseId of affectedCaseIds) {
    const tc = await storage.read<TestCase>(TC_COLLECTION, caseId);
    if (!tc || tc.apiChangeFlag) continue; // 已被删除标记的跳过

    // 查找该用例关联的端点的变更
    const mod = diffResult.modified.find((m) => m.endpointId === tc.endpointId);
    if (mod) {
      const updatedTc: TestCase = {
        ...tc,
        apiChangeFlag: {
          changedAt: now,
          changeType: "modified",
          changes: mod.changes,
          documentId,
          documentName: doc.name,
        },
        updatedAt: now,
      };
      await storage.write(TC_COLLECTION, tc.id, updatedTc);
    }
  }

  // 更新文档元数据
  const remainingEps = await storage.list<ApiEndpoint>(EP_COLLECTION);
  const docEpCount = remainingEps.filter((ep) => ep.documentId === documentId).length;
  const updatedDoc: ApiDocument = {
    ...doc,
    contentHash: req.contentHash,
    endpointCount: docEpCount,
    updatedAt: now,
  };
  await storage.write(DOC_COLLECTION, documentId, updatedDoc);

  // 自动关联新增端点
  await autoLinkTestCases(doc.projectId, added);

  // 收集受影响用例信息
  const affectedCases: ConfirmUpdateResult["affectedCases"] = [];
  for (const caseId of affectedCaseIds) {
    const tc = await storage.read<TestCase>(TC_COLLECTION, caseId);
    if (tc) {
      affectedCases.push({ id: tc.id, name: tc.name, apiChangeFlag: tc.apiChangeFlag });
    }
  }

  return { updated, added, deleted, affectedCases };
}

// ── Helpers ───────────────────────────────────────────

async function createEndpoints(
  projectId: string,
  documentId: string,
  endpoints: Endpoint[],
): Promise<ApiEndpoint[]> {
  const now = new Date().toISOString();
  const results: ApiEndpoint[] = [];

  for (const ep of endpoints) {
    const newEp: ApiEndpoint = {
      id: randomUUID(),
      projectId,
      documentId,
      method: ep.method,
      path: ep.path,
      summary: ep.summary,
      headers: ep.headers,
      queryParams: ep.queryParams,
      pathParams: ep.pathParams,
      body: ep.body,
      responses: ep.responses,
      createdAt: now,
      updatedAt: now,
    };
    await storage.write(EP_COLLECTION, newEp.id, newEp);
    results.push(newEp);
  }

  return results;
}

async function autoLinkTestCases(
  projectId: string,
  endpoints: ApiEndpoint[],
): Promise<void> {
  if (endpoints.length === 0) return;

  // 构建 method+path → endpointId 映射
  const epMap = new Map<string, string>();
  for (const ep of endpoints) {
    epMap.set(getEndpointKey(ep.method, ep.path), ep.id);
  }

  // 获取项目下所有用例
  const allEps = await storage.list<ApiEndpoint>(EP_COLLECTION);
  const projectEpIds = new Set(allEps.filter((ep) => ep.projectId === projectId).map((ep) => ep.id));
  const allCases = await storage.list<TestCase>(TC_COLLECTION);
  const projectCases = allCases.filter(
    (tc) => tc.endpointId === null || projectEpIds.has(tc.endpointId),
  );

  for (const tc of projectCases) {
    if (tc.endpointId) continue; // 已有关联

    // 通过 request 的 method+path 匹配
    const key = getEndpointKey(tc.request.method, tc.request.path);
    const epId = epMap.get(key);
    if (epId) {
      const updated: TestCase = {
        ...tc,
        endpointId: epId,
        updatedAt: new Date().toISOString(),
      };
      await storage.write(TC_COLLECTION, tc.id, updated);
    }
  }
}

async function getTestCasesByEndpointId(endpointId: string): Promise<TestCase[]> {
  const all = await storage.list<TestCase>(TC_COLLECTION);
  return all.filter((tc) => tc.endpointId === endpointId);
}

// ── Endpoint queries ──────────────────────────────────

export async function getEndpointsByDocumentId(documentId: string): Promise<ApiEndpoint[]> {
  const all = await storage.list<ApiEndpoint>(EP_COLLECTION);
  return all.filter((ep) => ep.documentId === documentId);
}

export async function getEndpointDetail(id: string): Promise<{ endpoint: ApiEndpoint; testCases: TestCase[] } | null> {
  const ep = await storage.read<ApiEndpoint>(EP_COLLECTION, id);
  if (!ep) return null;

  const allCases = await storage.list<TestCase>(TC_COLLECTION);
  const testCases = allCases.filter((tc) => tc.endpointId === id);

  return { endpoint: ep, testCases };
}

// ── Link endpoint ─────────────────────────────────────

export async function linkTestCaseEndpoint(
  testCaseId: string,
  endpointId: string | null,
): Promise<TestCase> {
  const tc = await storage.read<TestCase>(TC_COLLECTION, testCaseId);
  if (!tc) throw new Error("测试用例不存在");

  if (endpointId) {
    const ep = await storage.read<ApiEndpoint>(EP_COLLECTION, endpointId);
    if (!ep) throw new Error("端点不存在");
  }

  const updated: TestCase = {
    ...tc,
    endpointId: endpointId,
    apiChangeFlag: undefined, // 重新关联时清除变更标记
    updatedAt: new Date().toISOString(),
  };
  await storage.write(TC_COLLECTION, testCaseId, updated);
  return updated;
}
