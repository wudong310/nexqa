# NexQA API 管理模块 — 技术方案设计

> 版本: 1.0
> 创建日期: 2026-04-13
> 作者: 玄枢 (架构师)

---

## 1. 背景

### 1.1 业务需求概述

将 API 管理从测试用例模块中独立出来，作为一级模块：
- API 文档统一管理（上传、解析、存储、查看、编辑）
- 变更检测与追踪（自动检测 API 变更，标记受影响测试用例）
- API ↔ 用例双向关联（清晰展示关联关系）

### 1.2 现有系统分析

| 模块 | 现状 | 复用价值 |
|------|------|----------|
| api-parser.ts | 支持 5 种格式解析（OpenAPI 3.x、Swagger 2.0、Postman v2、HAR、cURL） | 直接复用，不修改接口 |
| api-diff-service.ts | 基于端点对比的 diff 算法，支持 breaking change 检测 | 复用并扩展 |
| storage.ts | 文件系统 JSON 存储 | 直接复用 |
| @nexqa/shared | Endpoint、ApiEndpoint、TestCase 类型定义 | 扩展 |

### 1.3 设计目标

1. 新增 ApiDocument 实体，管理文档级别的元数据
2. 扩展 ApiEndpoint，关联到文档
3. 扩展 TestCase，增加 API 变更标记
4. 实现变更检测流程，支持用户确认更新

---

## 2. 数据模型设计

### 2.1 实体关系图 (ER)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   ┌─────────────────────┐       1:N      ┌─────────────────────┐          │
│   │    ApiDocument      │───────────────▶│    ApiEndpoint      │          │
│   ├─────────────────────┤                ├─────────────────────┤          │
│   │ id: string (uuid)   │                │ id: string (uuid)   │          │
│   │ projectId: string   │                │ projectId: string   │          │
│   │ name: string        │                │ documentId: string  │◀─┐       │
│   │ format: ApiFormat   │                │ method: HttpMethod  │  │       │
│   │ source?: string     │                │ path: string        │  │       │
│   │ contentHash: string │                │ summary: string     │  │       │
│   │ endpointCount: int  │                │ headers: Param[]    │  │       │
│   │ createdAt: datetime │                │ queryParams: Param[]│  │       │
│   │ updatedAt: datetime │                │ pathParams: Param[] │  │       │
│   └─────────────────────┘                │ body?: BodyDef      │  │       │
│                                          │ responses: Resp[]   │  │       │
│                                          │ createdAt: datetime │  │       │
│                                          │ updatedAt: datetime │  │       │
│                                          └─────────────────────┘  │       │
│                                                    │               │       │
│                                                    │ 1:N           │       │
│                                                    ▼               │       │
│                                          ┌─────────────────────┐  │       │
│                                          │     TestCase        │  │       │
│                                          ├─────────────────────┤  │       │
│                                          │ id: string (uuid)   │  │       │
│                                          │ endpointId: string  │──┘       │
│                                          │ name: string        │          │
│                                          │ request: RequestDef │          │
│                                          │ expected: Expected  │          │
│                                          │ tags: TestCaseTags  │          │
│                                          │ apiChangeFlag?: {}  │◀─ 新增   │
│                                          │ createdAt: datetime │          │
│                                          │ updatedAt: datetime │          │
│                                          └─────────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 新增/扩展 Schema 定义

#### ApiDocument (新增)

```typescript
// @nexqa/shared/src/schemas/api-document.ts

import { z } from "zod";

export const ApiFormatSchema = z.enum([
  "openapi3",
  "swagger2",
  "postman-v2",
  "har",
  "curl",
]);
export type ApiFormat = z.infer<typeof ApiFormatSchema>;

export const ApiDocumentSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1),                    // 文档名称（从文件名或 URL 推断）
  format: ApiFormatSchema,                    // 文档格式
  source: z.string().nullable(),              // 来源 URL（如有）
  contentHash: z.string(),                    // SHA-256 hash，用于变更检测
  endpointCount: z.number().int().min(0),     // 包含的端点数量
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ApiDocument = z.infer<typeof ApiDocumentSchema>;
```

#### ApiEndpoint (扩展)

```typescript
// @nexqa/shared/src/schemas/api-doc.ts (扩展现有)

export const ApiEndpointSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  documentId: z.string().uuid(),              // 新增：所属文档 ID
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
  path: z.string(),
  summary: z.string().default(""),
  headers: z.array(ParamSchema).default([]),
  queryParams: z.array(ParamSchema).default([]),
  pathParams: z.array(ParamSchema).default([]),
  body: z.object({
    contentType: z.string().default("application/json"),
    schema: z.unknown().optional(),
    example: z.unknown().optional(),
  }).optional(),
  responses: z.array(EndpointResponseSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```

#### TestCase 扩展 (apiChangeFlag)

```typescript
// @nexqa/shared/src/schemas/test-case.ts (扩展现有)

export const FieldChangeSchema = z.object({
  field: z.string(),                         // 变更字段路径，如 "requestBody.status"
  type: z.enum(["added", "removed", "modified"]),
  detail: z.string(),                        // 变更描述
  breaking: z.boolean(),                     // 是否为破坏性变更
});
export type FieldChange = z.infer<typeof FieldChangeSchema>;

export const ApiChangeFlagSchema = z.object({
  changedAt: z.string().datetime(),          // 变更时间
  changeType: z.enum(["modified", "deleted"]),
  changes: z.array(FieldChangeSchema).optional(),  // 具体变更内容（仅 modified 时有）
  documentId: z.string().uuid(),             // 来源文档 ID
  documentName: z.string(),                  // 文档名称（用于前端展示）
});
export type ApiChangeFlag = z.infer<typeof ApiChangeFlagSchema>;

// TestCase 扩展
export const TestCaseSchema = z.object({
  id: z.string().uuid(),
  endpointId: z.string().uuid().nullable(),  // 改为可空
  name: z.string().min(1),
  request: TestCaseRequestSchema,
  expected: TestCaseExpectedSchema,
  tags: TestCaseTagsSchema.default({ purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" }),
  apiChangeFlag: ApiChangeFlagSchema.optional(),  // 新增：API 变更标记
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
```

### 2.3 存储设计

使用现有文件系统存储，Collection 规划：

| 实体 | Collection | 文件路径 | 说明 |
|------|------------|----------|------|
| ApiDocument | `api-documents` | `{dataDir}/api-documents/{id}.json` | 新增 |
| ApiEndpoint | `api-endpoints` | `{dataDir}/api-endpoints/{id}.json` | 复用现有 |
| TestCase | `test-cases` | `{dataDir}/test-cases/{id}.json` | 扩展字段 |

**索引策略**：文件系统无数据库索引，通过内存过滤实现：
- 按 projectId 过滤：遍历 collection，filter by projectId
- 按 documentId 过滤：遍历 api-endpoints，filter by documentId
- 按 endpointId 查询用例：遍历 test-cases，filter by endpointId

---

## 3. 变更检测算法详细设计

### 3.1 算法概述

```
用户上传文档
    │
    ▼
计算 contentHash，查询是否已存在该 hash
    │
    ├── 不存在 → 新文档，直接导入
    │
    └── 存在 → 提示"文档内容未变化"
    │
    或：用户明确指定要更新的文档
    │
    ▼
调用 diffEndpoints() 对比新旧端点
    │
    ▼
返回 ApiDiffResult
    │
    ▼
前端展示 diff，用户确认
    │
    ▼
执行更新，标记受影响用例
```

### 3.2 端点唯一键定义

```
endpointKey = `${method} ${path}`

示例：
- "GET /pets"
- "POST /pets/{id}/adopt"
- "DELETE /users/{id}"
```

**注意**：`method` 大写，`path` 保持原样（包含路径参数如 `{id}`）

### 3.3 Diff 结果结构

```typescript
// 复用并扩展 api-diff-service.ts 的类型

export interface ApiDiffResult {
  documentId: string;                      // 目标文档 ID
  documentName: string;
  summary: DiffSummary;
  added: EndpointChange[];                 // 新增的端点
  removed: EndpointChange[];               // 删除的端点
  modified: EndpointModification[];        // 修改的端点
  affectedCases: AffectedCase[];           // 受影响的测试用例
}

export interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
  breaking: number;                        // 破坏性变更数量
}

export interface EndpointChange {
  tempId: string;                          // 临时 ID（前端用）
  endpoint: Endpoint;                      // 端点定义
  description?: string;                    // 描述
}

export interface EndpointModification {
  endpointId: string;                      // 已存在的端点 ID
  endpoint: Endpoint;                      // 新的端点定义
  changes: FieldChange[];
  severity: "breaking" | "non-breaking" | "info";
}

export interface AffectedCase {
  testCaseId: string;
  testCaseName: string;
  endpointKey: string;                     // "GET /pets"
  impactType: "modified" | "deleted";
}
```

### 3.4 修改检测粒度

以下字段变化视为"修改"：

| 字段 | 检测方式 | Breaking 判断 |
|------|----------|---------------|
| summary | 字符串对比 | 否 |
| headers | 数组对比（name + type） | 新增必填 header → Breaking |
| queryParams | 数组对比（name + type + required） | 新增必填参数 → Breaking |
| pathParams | 数组对比（name） | 新增路径参数 → Breaking |
| body.schema | 深度对比 properties | 新增必填字段 → Breaking |
| body.contentType | 字符串对比 | 否 |
| responses | 对比状态码 + schema | 删除响应字段 → Breaking |

### 3.5 算法实现

```typescript
// packages/server/src/services/api-diff-service.ts (扩展)

import type { ApiEndpoint, Endpoint, Param } from "@nexqa/shared";
import { createHash } from "node:crypto";

/**
 * 计算内容 hash (SHA-256)
 */
export function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * 生成端点唯一键
 */
export function getEndpointKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

/**
 * 对比两个端点是否相同
 */
export function endpointsEqual(a: Endpoint, b: Endpoint): boolean {
  if (a.method !== b.method || a.path !== b.path) return false;
  
  // 简化对比：只比较关键字段
  return (
    JSON.stringify(a.headers.map(normalizeParam).sort()) ===
      JSON.stringify(b.headers.map(normalizeParam).sort()) &&
    JSON.stringify(a.queryParams.map(normalizeParam).sort()) ===
      JSON.stringify(b.queryParams.map(normalizeParam).sort()) &&
    JSON.stringify(a.pathParams.map(normalizeParam).sort()) ===
      JSON.stringify(b.pathParams.map(normalizeParam).sort())
  );
}

function normalizeParam(p: Param): string {
  return `${p.name}:${p.type}:${p.required}`;
}

/**
 * 检测端点变更
 */
export function diffEndpoints(
  existing: ApiEndpoint[],
  incoming: Endpoint[],
  documentId: string
): Omit<ApiDiffResult, "affectedCases"> {
  const existingMap = new Map<string, ApiEndpoint>();
  for (const ep of existing) {
    existingMap.set(getEndpointKey(ep.method, ep.path), ep);
  }

  const added: EndpointChange[] = [];
  const removed: EndpointChange[] = [];
  const modified: EndpointModification[] = [];

  // 检测新增和修改
  for (const ep of incoming) {
    const key = getEndpointKey(ep.method, ep.path);
    const existingEp = existingMap.get(key);
    
    if (!existingEp) {
      // 新增
      added.push({
        tempId: `temp-${key}`,
        endpoint: ep,
        description: ep.summary,
      });
    } else if (!endpointsEqual(existingEp, ep)) {
      // 修改
      const changes = detectFieldChanges(existingEp, ep);
      const hasBreaking = changes.some(c => c.breaking);
      modified.push({
        endpointId: existingEp.id,
        endpoint: ep,
        changes,
        severity: hasBreaking ? "breaking" : "non-breaking",
      });
    }
    
    existingMap.delete(key);
  }

  // 剩余的是删除的
  for (const [key, ep] of existingMap) {
    removed.push({
      tempId: `removed-${key}`,
      endpoint: ep,
      description: ep.summary,
    });
  }

  const breakingCount = 
    modified.filter(m => m.severity === "breaking").length + 
    removed.length;

  return {
    documentId,
    documentName: "", // 调用方填充
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
 * 检测字段级别变更
 */
function detectFieldChanges(
  oldEp: ApiEndpoint | Endpoint,
  newEp: Endpoint
): FieldChange[] {
  const changes: FieldChange[] = [];

  // 对比 queryParams
  changes.push(...diffParams(
    oldEp.queryParams,
    newEp.queryParams,
    "queryParam"
  ));

  // 对比 headers
  changes.push(...diffParams(
    oldEp.headers,
    newEp.headers,
    "header"
  ));

  // 对比 pathParams
  changes.push(...diffParams(
    oldEp.pathParams,
    newEp.pathParams,
    "pathParam"
  ));

  // 对比 body
  if (oldEp.body || newEp.body) {
    changes.push(...diffBody(oldEp.body, newEp.body));
  }

  return changes;
}

function diffParams(
  oldParams: Param[],
  newParams: Param[],
  prefix: string
): FieldChange[] {
  const changes: FieldChange[] = [];
  const oldMap = new Map(oldParams.map(p => [p.name, p]));
  const newMap = new Map(newParams.map(p => [p.name, p]));

  for (const [name, param] of newMap) {
    if (!oldMap.has(name)) {
      changes.push({
        field: `${prefix}.${name}`,
        type: "added",
        detail: `新增${param.required ? "必填" : "可选"}参数 '${name}'`,
        breaking: param.required,
      });
    }
  }

  for (const [name, param] of oldMap) {
    if (!newMap.has(name)) {
      changes.push({
        field: `${prefix}.${name}`,
        type: "removed",
        detail: `移除参数 '${name}'`,
        breaking: false,
      });
    } else {
      // 检测 required 变化
      const newParam = newMap.get(name)!;
      if (!param.required && newParam.required) {
        changes.push({
          field: `${prefix}.${name}`,
          type: "modified",
          detail: `参数 '${name}' 变为必填`,
          breaking: true,
        });
      }
    }
  }

  return changes;
}

function diffBody(
  oldBody: Endpoint["body"],
  newBody: Endpoint["body"]
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

  // 简化：只检测 schema 变化，不深度对比
  // 完整实现需要递归对比 schema properties
  if (oldBody && newBody) {
    if (oldBody.contentType !== newBody.contentType) {
      changes.push({
        field: "body.contentType",
        type: "modified",
        detail: `Content-Type 变更: ${oldBody.contentType} → ${newBody.contentType}`,
        breaking: false,
      });
    }
  }

  return changes;
}
```

### 3.6 变更确认流程

```
1. 用户查看 diff 结果
2. 用户选择接受/拒绝每一类变更：
   - acceptAdded: string[]      // 接受的新增端点 tempId
   - acceptModified: string[]   // 接受的修改端点 ID
   - acceptRemoved: string[]    // 接受删除的端点 ID
3. 后端执行更新：
   a. 新增端点：创建 ApiEndpoint 记录
   b. 修改端点：更新 ApiEndpoint 记录
   c. 删除端点：删除 ApiEndpoint，标记关联用例
4. 更新 ApiDocument 的 endpointCount、contentHash、updatedAt
5. 查询所有受影响的测试用例，设置 apiChangeFlag
```

---

## 4. API 路由设计

### 4.1 路由清单

| 方法 | 路径 | 说明 | 新增/修改 |
|------|------|------|-----------|
| GET | `/api-documents` | 获取文档列表 | 新增 |
| GET | `/api-documents/:id` | 获取文档详情（含端点列表） | 新增 |
| POST | `/api-documents/import` | 导入/更新 API 文档 | 新增 |
| POST | `/api-documents/:id/confirm-update` | 确认变更更新 | 新增 |
| DELETE | `/api-documents/:id` | 删除文档及端点 | 新增 |
| GET | `/api-endpoints` | 获取端点列表 | 修改（增加 documentId 过滤） |
| GET | `/api-endpoints/:id` | 获取端点详情（含关联用例） | 新增 |
| POST | `/api-endpoints/:id/update` | 更新端点 | 复用 |
| POST | `/api-endpoints/:id/delete` | 删除端点 | 复用 |
| POST | `/test-cases/:id/link-endpoint` | 修改用例关联的 API | 新增 |

### 4.2 接口详细设计

#### 4.2.1 获取文档列表

```
GET /api-documents?projectId={projectId}

Query Parameters:
  - projectId: string (required) - 项目 ID

Response 200:
{
  "data": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "name": "petstore-v3.json",
      "format": "openapi3",
      "source": "https://petstore3.swagger.io/api/v3/openapi.json",
      "contentHash": "sha256...",
      "endpointCount": 20,
      "createdAt": "2026-04-13T10:00:00Z",
      "updatedAt": "2026-04-13T10:00:00Z"
    }
  ]
}
```

#### 4.2.2 获取文档详情

```
GET /api-documents/:id

Response 200:
{
  "document": {
    "id": "uuid",
    "projectId": "uuid",
    "name": "petstore-v3.json",
    "format": "openapi3",
    ...
  },
  "endpoints": [
    {
      "id": "uuid",
      "documentId": "uuid",
      "method": "GET",
      "path": "/pets",
      "summary": "查询宠物列表",
      "testCaseCount": 3,
      ...
    }
  ]
}
```

#### 4.2.3 导入/更新 API 文档

```
POST /api-documents/import

Request Body:
{
  "projectId": "uuid",
  "name": "petstore-v3.json",        // 可选，默认从内容推断
  "content": "{ ... }",              // 文档内容
  "source": "https://...",           // 可选，来源 URL
  "updateDocumentId": "uuid"         // 可选，指定要更新的文档 ID
}

Response 200 (新文档):
{
  "isUpdate": false,
  "document": { ... },
  "endpoints": [ ... ],
  "parseResult": {
    "format": "openapi3",
    "endpointCount": 20
  }
}

Response 200 (更新已有文档):
{
  "isUpdate": true,
  "document": { ... },
  "diff": {
    "summary": { "added": 2, "removed": 1, "modified": 3, "breaking": 1 },
    "added": [ ... ],
    "removed": [ ... ],
    "modified": [ ... ],
    "affectedCases": [ ... ]
  }
}
```

#### 4.2.4 确认变更更新

```
POST /api-documents/:id/confirm-update

Request Body:
{
  "contentHash": "sha256...",        // 用于乐观锁
  "acceptAdded": ["temp-GET /new"],  // 接受的新增端点 tempId
  "acceptModified": ["uuid-1"],      // 接受的修改端点 ID
  "acceptRemoved": ["uuid-2"]        // 接受删除的端点 ID
}

Response 200:
{
  "updated": [ ... ],                // 更新的端点
  "deleted": ["uuid-2"],             // 删除的端点 ID
  "affectedCases": [
    {
      "id": "uuid",
      "name": "查询宠物列表-正常",
      "apiChangeFlag": {
        "changedAt": "2026-04-13T10:00:00Z",
        "changeType": "modified",
        "changes": [ ... ]
      }
    }
  ]
}
```

#### 4.2.5 获取端点详情

```
GET /api-endpoints/:id

Response 200:
{
  "id": "uuid",
  "documentId": "uuid",
  "method": "GET",
  "path": "/pets",
  "summary": "查询宠物列表",
  "headers": [ ... ],
  "queryParams": [ ... ],
  "pathParams": [ ... ],
  "body": { ... },
  "responses": [ ... ],
  "testCases": [
    {
      "id": "uuid",
      "name": "查询宠物列表-正常",
      "apiChangeFlag": null
    },
    {
      "id": "uuid",
      "name": "查询宠物列表-异常",
      "apiChangeFlag": { ... }
    }
  ]
}
```

#### 4.2.6 修改测试用例关联

```
POST /test-cases/:id/link-endpoint

Request Body:
{
  "endpointId": "uuid" | null        // null 表示解除关联
}

Response 200:
{
  "id": "uuid",
  "endpointId": "uuid",
  "name": "查询宠物列表-正常",
  "apiChangeFlag": null,             // 关联更新时清除变更标记
  ...
}
```

---

## 5. 前后端接口契约

### 5.1 TypeScript 类型定义

```typescript
// packages/web/src/types/api-management.ts

export interface ApiDocument {
  id: string;
  projectId: string;
  name: string;
  format: ApiFormat;
  source: string | null;
  contentHash: string;
  endpointCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ApiFormat = 
  | "openapi3"
  | "swagger2"
  | "postman-v2"
  | "har"
  | "curl";

export interface ApiEndpointDetail extends ApiEndpoint {
  testCases: TestCase[];
}

export interface ImportResult {
  isUpdate: boolean;
  document: ApiDocument;
  endpoints?: ApiEndpoint[];
  diff?: ApiDiffResult;
  parseResult?: {
    format: ApiFormat;
    endpointCount: number;
  };
}

export interface ConfirmUpdateResult {
  updated: ApiEndpoint[];
  deleted: string[];
  affectedCases: TestCase[];
}
```

### 5.2 前端 API 调用封装

```typescript
// packages/web/src/lib/api-documents.ts

import { api } from "./api";
import type { ApiDocument, ApiEndpoint, ImportResult, ConfirmUpdateResult } from "@/types/api-management";

export const apiDocumentsApi = {
  list: (projectId: string) =>
    api.get<ApiDocument[]>(`/api-documents?projectId=${projectId}`),

  get: (id: string) =>
    api.get<{ document: ApiDocument; endpoints: ApiEndpoint[] }>(`/api-documents/${id}`),

  import: (data: {
    projectId: string;
    name?: string;
    content: string;
    source?: string;
    updateDocumentId?: string;
  }) => api.post<ImportResult>("/api-documents/import", data),

  confirmUpdate: (id: string, data: {
    contentHash: string;
    acceptAdded: string[];
    acceptModified: string[];
    acceptRemoved: string[];
  }) => api.post<ConfirmUpdateResult>(`/api-documents/${id}/confirm-update`, data),

  delete: (id: string) =>
    api.delete(`/api-documents/${id}`),
};

export const apiEndpointsApi = {
  list: (projectId: string, documentId?: string) => {
    const params = new URLSearchParams({ projectId });
    if (documentId) params.append("documentId", documentId);
    return api.get<ApiEndpoint[]>(`/api-endpoints?${params}`);
  },

  get: (id: string) =>
    api.get<ApiEndpoint & { testCases: TestCase[] }>(`/api-endpoints/${id}`),

  update: (id: string, data: Partial<ApiEndpoint>) =>
    api.post<ApiEndpoint>(`/api-endpoints/${id}/update`, data),

  delete: (id: string) =>
    api.post<{ success: boolean; affectedCases: string[] }>(`/api-endpoints/${id}/delete`, {}),
};

export const testCasesApi = {
  linkEndpoint: (id: string, endpointId: string | null) =>
    api.post<TestCase>(`/test-cases/${id}/link-endpoint`, { endpointId }),
};
```

### 5.3 React Query Hooks

```typescript
// packages/web/src/hooks/use-api-documents.ts

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiDocumentsApi, apiEndpointsApi, testCasesApi } from "@/lib/api-documents";

export function useApiDocuments(projectId: string) {
  return useQuery({
    queryKey: ["api-documents", projectId],
    queryFn: () => apiDocumentsApi.list(projectId),
  });
}

export function useApiDocument(id: string) {
  return useQuery({
    queryKey: ["api-document", id],
    queryFn: () => apiDocumentsApi.get(id),
    enabled: !!id,
  });
}

export function useApiEndpoints(projectId: string, documentId?: string) {
  return useQuery({
    queryKey: ["api-endpoints", projectId, documentId],
    queryFn: () => apiEndpointsApi.list(projectId, documentId),
  });
}

export function useImportApiDocument() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: apiDocumentsApi.import,
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["api-documents", projectId] });
      queryClient.invalidateQueries({ queryKey: ["api-endpoints", projectId] });
    },
  });
}

export function useConfirmUpdate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof apiDocumentsApi.confirmUpdate>[1] }) =>
      apiDocumentsApi.confirmUpdate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-documents"] });
      queryClient.invalidateQueries({ queryKey: ["api-endpoints"] });
      queryClient.invalidateQueries({ queryKey: ["test-cases"] });
    },
  });
}

export function useLinkEndpoint() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ testCaseId, endpointId }: { testCaseId: string; endpointId: string | null }) =>
      testCasesApi.linkEndpoint(testCaseId, endpointId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["test-cases"] });
      queryClient.invalidateQueries({ queryKey: ["api-endpoints"] });
    },
  });
}
```

---

## 6. 迁移方案

### 6.1 数据迁移

**现有数据评估**：
- 现有 `api-endpoints` 无 `documentId` 字段
- 现有 `test-cases` 无 `apiChangeFlag` 字段

**迁移策略**：向后兼容，无需数据迁移

| 表 | 迁移方式 |
|------|----------|
| ApiEndpoint | 新增 `documentId` 字段，旧数据该字段为空（视为"手动添加"） |
| TestCase | 新增 `apiChangeFlag` 字段，旧数据该字段为空 |

**实现**：
1. Schema 定义中 `documentId` 允许为空（`nullable()`）
2. 前端兼容处理：无 `documentId` 的端点显示为"手动添加"
3. 导入流程创建的端点必定有 `documentId`

### 6.2 代码迁移

从测试用例模块迁移 API 导入功能：

#### Phase 1: 后端新增路由（不影响现有功能）

1. 新增 `routes/api-documents.ts`
2. 新增 `schemas/api-document.ts` 到 @nexqa/shared
3. 扩展 `api-diff-service.ts` 变更检测逻辑
4. 扩展 `routes/api-endpoints.ts` 增加 `documentId` 过滤

#### Phase 2: 前端新增页面

1. 新增 `routes/api-management.tsx` — API 管理首页
2. 新增 `components/api-management/` 目录
3. 复用 `ImportApiSheet` 组件（需扩展变更确认逻辑）

#### Phase 3: 关联功能

1. 扩展 `routes/test-cases.ts` 增加 `link-endpoint` 路由
2. 前端测试用例编辑页增加"关联 API"功能
3. 测试用例列表增加 `apiChangeFlag` 展示

### 6.3 迁移步骤

```
Step 1: Schema 扩展
├── @nexqa/shared/src/schemas/api-document.ts (新增)
├── @nexqa/shared/src/schemas/api-doc.ts (扩展 ApiEndpointSchema)
└── @nexqa/shared/src/schemas/test-case.ts (扩展 TestCaseSchema)

Step 2: 后端服务扩展
├── services/api-diff-service.ts (扩展 diffEndpoints)
└── 新增 services/api-document-service.ts (文档管理服务)

Step 3: 后端路由新增
├── routes/api-documents.ts (新增)
└── index.ts 注册路由

Step 4: 前端类型与 API 封装
├── types/api-management.ts (新增)
└── lib/api-documents.ts (新增)

Step 5: 前端页面与组件
├── routes/api-management.tsx (新增)
├── components/api-management/ (新增)
└── router.tsx 注册路由

Step 6: 测试用例关联功能
├── routes/test-cases.ts (扩展 link-endpoint)
└── components/test-case-editor.tsx (扩展关联 API)
```

---

## 7. 技术选型说明

### 7.1 核心技术栈

| 组件 | 选型 | 版本 | 理由 |
|------|------|------|------|
| 语言 | TypeScript | 5.x | 项目统一 |
| 后端框架 | Hono | 现有 | 项目统一 |
| 前端框架 | React + TanStack Router | 现有 | 项目统一 |
| 存储 | 文件系统 JSON | 现有 | 无需引入数据库，轻量化 |
| 状态管理 | TanStack Query | 现有 | 项目统一 |
| UI 组件 | shadcn/ui | 现有 | 项目统一 |

### 7.2 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 文档唯一标识 | `name + format` 组合 | 用户可识别，避免 hash 对比的不直观 |
| 端点唯一键 | `method + path` | RESTful 标准实践，简单可靠 |
| 变更检测粒度 | 参数级别 | 平衡实现复杂度与实用性 |
| 删除 API 时用例处理 | 保留用例，清空 endpointId，标记"API 已删除" | 避免数据丢失，用户可自行处理 |

### 7.3 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| 文件系统存储性能 | 中 | 后续可迁移到 SQLite/PostgreSQL |
| 变更检测算法不完整 | 低 | 先支持常见场景，后续迭代优化 |
| 大型文档解析性能 | 低 | 前端分页展示，后端流式解析 |

---

## 8. 工作量估算

| 模块 | 任务 | 工作量 | 负责角色 |
|------|------|--------|----------|
| Schema 扩展 | 新增/扩展类型定义 | 0.5d | 后端研发 |
| 后端服务 | api-document-service.ts | 1d | 后端研发 |
| 后端服务 | api-diff-service.ts 扩展 | 1d | 后端研发 |
| 后端路由 | api-documents.ts | 1d | 后端研发 |
| 后端路由 | test-cases.ts 扩展 | 0.5d | 后端研发 |
| 前端 API | api-documents.ts, hooks | 0.5d | 前端研发 |
| 前端页面 | API 管理首页 | 1.5d | 前端研发 |
| 前端组件 | 变更确认 Modal | 1d | 前端研发 |
| 前端功能 | 测试用例关联 API | 1d | 前端研发 |
| 集成测试 | E2E 测试 | 1d | 测试 |
| **总计** | | **9d** | |

---

## 9. 里程碑

- **M1 (W1)**: 后端 Schema + 服务 + 路由完成
- **M2 (W2)**: 前端 API 管理页面完成
- **M3 (W3)**: 变更确认流程 + 用例关联完成
- **M4 (W4)**: 集成测试 + 上线

---

## 附录

### A. 相关文档

- PRD: `~/Projects/nexqa/openspec/specs/api-management/PRD.md`
- 现有 api-parser: `~/Projects/nexqa/packages/server/src/services/api-parser.ts`
- 现有 api-diff-service: `~/Projects/nexqa/packages/server/src/services/api-diff-service.ts`
- 现有类型定义: `~/Projects/nexqa/packages/shared/src/schemas/api-doc.ts`

### B. Open Questions 决策

| # | 问题 | 决策 |
|---|------|------|
| Q1 | 文档唯一标识如何确定？ | 使用 `name + format` 组合，用户可在导入时修改名称 |
| Q2 | 删除 API 时关联用例如何处理？ | 保留用例，清空 endpointId，设置 apiChangeFlag.changeType = "deleted" |
| Q3 | 变更检测是否需要保留旧版本？ | MVP 不做版本历史，后续可扩展 |
