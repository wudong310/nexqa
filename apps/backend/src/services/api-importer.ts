/**
 * API Importer — 将 source-scanner 扫描结果智能导入到 ApiEndpoint 存储
 *
 * 核心流程：
 * 1. 加载该 gitSourceId 下已有的所有 ApiEndpoint
 * 2. diff：对比 method+path 识别新增/变更/删除
 * 3. merge：新 → 创建，变更 → 更新字段，删除 → 标记（不物理删除）
 * 4. 更新关联测试用例的 apiChangeFlag
 */

import { randomUUID } from "node:crypto";
import type {
  ApiChangeFlag,
  ApiEndpoint,
  Endpoint,
  FieldChange,
  ScanChange,
  TestCase,
} from "@nexqa/shared";
import { storage } from "./storage.js";

const EP_COLLECTION = "api-endpoints";
const TC_COLLECTION = "test-cases";

/**
 * 从 API 路径中提取业务模块名。
 * 去掉公共前缀后取第一段路径作为模块名。
 */
export function extractModule(path: string): string {
  const stripped = path.replace(/^\/(?:console\/api|nexqa\/api|api)\//, '');
  const firstSegment = stripped.split('/')[0];
  return firstSegment && !firstSegment.startsWith(':') ? firstSegment : 'uncategorized';
}

// ── Public Types ──────────────────────────────────────

export interface ImportResult {
  added: ApiEndpoint[];
  updated: ApiEndpoint[];
  removed: string[]; // 被标记删除的 endpoint IDs
  unchanged: number;
  changes: ScanChange[];
}

export interface ImportOptions {
  projectId: string;
  gitSourceId: string;
  scanId: string;
  /** 是否自动移除不再存在的端点（默认 false，仅标记） */
  autoRemove?: boolean;
}

// ── Helpers ───────────────────────────────────────────

/** 生成 endpoint diff key：`METHOD /path`，大小写规范化 */
function endpointKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

/** 对比两个 Param 数组是否内容相同 */
function paramsEqual(
  a: Array<{ name: string; type: string; required: boolean; description: string }>,
  b: Array<{ name: string; type: string; required: boolean; description: string }>,
): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x.name.localeCompare(y.name));
  const sortedB = [...b].sort((x, y) => x.name.localeCompare(y.name));
  for (let i = 0; i < sortedA.length; i++) {
    const pa = sortedA[i];
    const pb = sortedB[i];
    if (
      pa.name !== pb.name ||
      pa.type !== pb.type ||
      pa.required !== pb.required ||
      pa.description !== pb.description
    ) {
      return false;
    }
  }
  return true;
}

/** 检测两个 endpoint 之间哪些字段发生了变更 */
function detectChangedFields(
  existing: ApiEndpoint,
  incoming: Endpoint,
): FieldChange[] {
  const changes: FieldChange[] = [];

  if (existing.summary !== incoming.summary) {
    changes.push({
      field: "summary",
      type: "modified",
      detail: `摘要变更: "${existing.summary}" → "${incoming.summary}"`,
      breaking: false,
    });
  }

  if (!paramsEqual(existing.queryParams, incoming.queryParams)) {
    changes.push({
      field: "queryParams",
      type: "modified",
      detail: "查询参数变更",
      breaking: true,
    });
  }

  if (!paramsEqual(existing.pathParams, incoming.pathParams)) {
    changes.push({
      field: "pathParams",
      type: "modified",
      detail: "路径参数变更",
      breaking: true,
    });
  }

  if (!paramsEqual(existing.headers, incoming.headers)) {
    changes.push({
      field: "headers",
      type: "modified",
      detail: "请求头变更",
      breaking: false,
    });
  }

  // body 对比用 JSON 序列化
  const existingBody = JSON.stringify(existing.body ?? null);
  const incomingBody = JSON.stringify(incoming.body ?? null);
  if (existingBody !== incomingBody) {
    changes.push({
      field: "body",
      type: "modified",
      detail: "请求体变更",
      breaking: true,
    });
  }

  // responses 对比用 JSON 序列化
  const existingResponses = JSON.stringify(existing.responses ?? []);
  const incomingResponses = JSON.stringify(incoming.responses ?? []);
  if (existingResponses !== incomingResponses) {
    changes.push({
      field: "responses",
      type: "modified",
      detail: "响应定义变更",
      breaking: true,
    });
  }

  return changes;
}

/** 为有变更/删除的 endpoint 标记关联测试用例的 apiChangeFlag */
async function markAffectedTestCases(
  endpointId: string,
  changeType: "modified" | "deleted",
  gitSourceId: string,
  changedFields?: FieldChange[],
): Promise<void> {
  const allCases = await storage.list<TestCase>(TC_COLLECTION);
  const affected = allCases.filter((tc) => tc.endpointId === endpointId);
  const now = new Date().toISOString();

  for (const tc of affected) {
    const flag: ApiChangeFlag = {
      changedAt: now,
      changeType,
      changes: changedFields,
      documentId: gitSourceId, // 使用 gitSourceId 作为变更来源标识
      documentName: `git-scan:${gitSourceId}`,
    };
    const updated: TestCase = {
      ...tc,
      apiChangeFlag: flag,
      updatedAt: now,
    };
    await storage.write(TC_COLLECTION, tc.id, updated);
  }
}

// ── Main Import Function ──────────────────────────────

/**
 * 将扫描结果导入 API 管理
 *
 * 核心逻辑：
 * 1. 加载该 gitSourceId 下已有的所有 ApiEndpoint
 * 2. diff：对比 method+path 识别新增/变更/删除
 * 3. merge：新 → 创建，变更 → 更新字段，删除 → 标记（不物理删除）
 * 4. 更新测试用例的 apiChangeFlag（有变更的端点关联的用例标记变更）
 */
export async function importEndpoints(
  endpoints: Endpoint[],
  options: ImportOptions,
): Promise<ImportResult> {
  const { projectId, gitSourceId, scanId } = options;
  const now = new Date().toISOString();

  // 1. 加载该 gitSourceId 下已有的所有 ApiEndpoint
  const allEndpoints = await storage.list<ApiEndpoint>(EP_COLLECTION);
  const existingBySource = allEndpoints.filter(
    (ep) => ep.gitSourceId === gitSourceId && ep.projectId === projectId,
  );

  // 构建 key → existing endpoint 映射
  const existingMap = new Map<string, ApiEndpoint>();
  for (const ep of existingBySource) {
    existingMap.set(endpointKey(ep.method, ep.path), ep);
  }

  // 构建 key → incoming endpoint 映射
  const incomingMap = new Map<string, Endpoint>();
  for (const ep of endpoints) {
    incomingMap.set(endpointKey(ep.method, ep.path), ep);
  }

  const result: ImportResult = {
    added: [],
    updated: [],
    removed: [],
    unchanged: 0,
    changes: [],
  };

  // 2. diff + merge

  // ── 新增 & 变更 ────────────────────────────────────
  for (const [key, incoming] of incomingMap) {
    const existing = existingMap.get(key);

    if (!existing) {
      // 新增：scanner 有，存储没有
      const newEp: ApiEndpoint = {
        id: randomUUID(),
        projectId,
        documentId: null,
        method: incoming.method,
        path: incoming.path,
        summary: incoming.summary,
        headers: incoming.headers,
        queryParams: incoming.queryParams,
        pathParams: incoming.pathParams,
        body: incoming.body,
        responses: incoming.responses,
        sourceType: "git-scan",
        gitSourceId,
        lastScanId: scanId,
        module: extractModule(incoming.path),
        createdAt: now,
        updatedAt: now,
      };
      await storage.write(EP_COLLECTION, newEp.id, newEp);
      result.added.push(newEp);
      result.changes.push({
        type: "added",
        method: incoming.method,
        path: incoming.path,
        summary: incoming.summary || "",
        endpointId: newEp.id,
      });
    } else {
      // 检测变更
      const changedFields = detectChangedFields(existing, incoming);

      if (changedFields.length > 0) {
        // 变更：更新字段
        const updatedEp: ApiEndpoint = {
          ...existing,
          summary: incoming.summary,
          headers: incoming.headers,
          queryParams: incoming.queryParams,
          pathParams: incoming.pathParams,
          body: incoming.body,
          responses: incoming.responses,
          lastScanId: scanId,
          updatedAt: now,
        };
        await storage.write(EP_COLLECTION, updatedEp.id, updatedEp);
        result.updated.push(updatedEp);
        result.changes.push({
          type: "updated",
          method: existing.method,
          path: existing.path,
          summary: incoming.summary || existing.summary || "",
          endpointId: existing.id,
          fields: changedFields.map((f) => ({ field: f.field, detail: f.detail })),
        });

        // 标记关联测试用例
        await markAffectedTestCases(
          existing.id,
          "modified",
          gitSourceId,
          changedFields,
        );
      } else {
        // 无变更，仅更新 lastScanId
        const unchanged: ApiEndpoint = {
          ...existing,
          lastScanId: scanId,
        };
        await storage.write(EP_COLLECTION, unchanged.id, unchanged);
        result.unchanged++;
      }
    }
  }

  // ── 删除检测 ───────────────────────────────────────
  for (const [key, existing] of existingMap) {
    if (!incomingMap.has(key)) {
      // 存储有，scanner 没有 → 标记为删除候选
      result.removed.push(existing.id);
      result.changes.push({
        type: "removed",
        method: existing.method,
        path: existing.path,
        summary: existing.summary || "",
        endpointId: existing.id,
      });

      // 标记关联测试用例
      await markAffectedTestCases(existing.id, "deleted", gitSourceId);

      // autoRemove 模式下物理删除，否则仅标记
      if (options.autoRemove) {
        await storage.remove(EP_COLLECTION, existing.id);
      }
    }
  }

  return result;
}
