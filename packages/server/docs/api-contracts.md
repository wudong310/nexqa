# NexQA API 协议文档

> 基于 Hono 框架，所有路由前缀为 `/nexqa/api`。
>
> 通用 Headers：
> - `x-trace-id` (string, optional): 链路追踪 ID，服务端会自动生成并回传

---

## Health Check

### GET /nexqa/api/health

健康检查端点。

**Response** `200`
```json
{ "status": "ok" }
```

---

## Settings（设置）

路由前缀：`/nexqa/api/settings`

### GET /nexqa/api/settings

获取全局设置（敏感字段已脱敏）。

**Response** `200`
```json
{
  "llm": {
    "provider": "string",
    "model": "string",
    "baseURL": "string",
    "apiKey": "abc123***wxyz"
  }
}
```

### GET /nexqa/api/settings/defaults

获取默认数据/日志目录配置。

**Response** `200`
```json
{
  "dataDir": "string",
  "logDir": "string",
  "currentDataDir": "string",
  "currentLogDir": "string"
}
```

### POST /nexqa/api/settings/update

更新全局设置。

**Request Body** — 符合 `SettingsSchema`
```json
{
  "llm": {
    "provider": "openai",
    "model": "gpt-4",
    "baseURL": "https://api.openai.com/v1",
    "apiKey": "sk-xxx"
  }
}
```

**Response** `200` — 更新后的设置（apiKey 已脱敏）

---

## LLM（大语言模型）

路由前缀：`/nexqa/api/llm`

### POST /nexqa/api/llm/test-connection

测试 LLM 连接。

**Request Body** — `LlmConfig`
```json
{
  "provider": "openai | anthropic | deepseek | custom",
  "model": "string",
  "baseURL": "string",
  "apiKey": "string"
}
```

**Response** `200`
```json
{
  "ok": true,
  "duration": 1234,
  "model": "gpt-4",
  "response": "Hello! ..."
}
```

**Error** `400`
```json
{ "ok": false, "error": "错误信息" }
```

### POST /nexqa/api/llm/chat

LLM 对话（流式响应）。需要先在 Settings 中配置 LLM。

**Request Body**
```json
{
  "messages": [
    { "role": "user", "content": "string" },
    { "role": "assistant", "content": "string" }
  ],
  "system": "string (optional)"
}
```

**Response** — SSE Data Stream（`text/event-stream`）

**Error** `400`
```json
{ "error": "LLM not configured. Please configure in Settings." }
```

---

## Projects（项目）

路由前缀：`/nexqa/api/projects`

### GET /nexqa/api/projects

获取项目列表（按 `updatedAt` 降序排列）。

**Response** `200`
```json
[
  {
    "id": "uuid",
    "name": "string",
    "description": "string",
    "baseURL": "https://api.example.com",
    "headers": { "Authorization": "Bearer xxx" },
    "variables": {},
    "activeEnvironmentId": "uuid | null",
    "openclawConnections": [],
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  }
]
```

### GET /nexqa/api/projects/detail

获取项目详情。

**Query Parameters**
- `id` (string, required): 项目 ID

**Response** `200` — `Project` 对象

**Error** `400` `{ "error": "id is required" }` / `404` `{ "error": "Project not found" }`

### GET /nexqa/api/projects/ping

Ping 项目 baseURL 检测连通性。

**Query Parameters**
- `id` (string, required): 项目 ID

**Response** `200`
```json
{
  "online": true,
  "status": 200,
  "latency": 123
}
```

### POST /nexqa/api/projects

创建项目（同时自动创建默认环境）。

**Request Body** — `CreateProjectSchema`
```json
{
  "name": "string (required)",
  "baseURL": "string, URL (required)",
  "description": "string (optional, max 500)",
  "headers": { "key": "value" },
  "variables": {},
  "openclawConnections": [],
  "activeEnvironmentId": "uuid | null"
}
```

**Response** `201` — 创建的 `Project` 对象（含 `activeEnvironmentId` 指向默认环境）

### POST /nexqa/api/projects/update

更新项目。

**Request Body**
```json
{
  "id": "string (required)",
  "name": "string (optional)",
  "baseURL": "string (optional)",
  "description": "string (optional, max 500)",
  "headers": {},
  "activeEnvironmentId": "uuid (optional, 需为该项目的合法环境)"
}
```

**Response** `200` — 更新后的 `Project`

**Error** `400` / `404`

### POST /nexqa/api/projects/delete

删除项目（级联删除关联的端点、用例、测试结果、批次运行、环境等）。

**Request Body**
```json
{ "id": "string (required)" }
```

**Response** `200`
```json
{ "success": true }
```

### POST /nexqa/api/projects/delete-results

清空项目的所有测试结果（保留用例和端点）。

**Request Body**
```json
{ "id": "string (required)" }
```

**Response** `200`
```json
{
  "deleted": {
    "batchRuns": 5,
    "testResults": 120
  }
}
```

---

## API Endpoints（接口端点）

路由前缀：`/nexqa/api/api-endpoints`

### GET /nexqa/api/api-endpoints

获取接口列表（按 path + method 排序）。

**Query Parameters**
- `projectId` (string, optional): 按项目过滤

**Response** `200`
```json
[
  {
    "id": "uuid",
    "projectId": "uuid",
    "method": "GET",
    "path": "/users",
    "summary": "获取用户列表",
    "headers": [],
    "queryParams": [],
    "pathParams": [],
    "body": null,
    "responses": [],
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  }
]
```

### POST /nexqa/api/api-endpoints/import

批量导入端点（已有则合并更新，无则新建）。

**Request Body**
```json
{
  "projectId": "uuid (required)",
  "endpoints": [
    {
      "method": "GET | POST | PUT | DELETE | ...",
      "path": "/users/:id",
      "summary": "string",
      "headers": [],
      "queryParams": [],
      "pathParams": [],
      "body": null,
      "responses": []
    }
  ]
}
```

**Response** `201` — 导入后的 `ApiEndpoint[]`

### POST /nexqa/api/api-endpoints/update

更新单个端点。

**Request Body**
```json
{
  "id": "uuid (required)",
  "method": "string (optional)",
  "path": "string (optional)",
  "summary": "string (optional)",
  ...
}
```

**Response** `200` — 更新后的 `ApiEndpoint`

### POST /nexqa/api/api-endpoints/delete

删除端点（级联删除关联用例）。

**Request Body**
```json
{ "id": "uuid (required)" }
```

**Response** `200` `{ "success": true }`

### POST /nexqa/api/api-endpoints/parse

解析 API 文档内容（支持 OpenAPI 3.x / Swagger 2.0 / Postman / HAR / cURL）。

**Request Body**
```json
{ "content": "string (required, 文档内容)" }
```

**Response** `200`
```json
{
  "format": "openapi3 | swagger2 | postman | har | curl",
  "endpoints": [ ... ]
}
```

**Error** `400` — 内容为空或格式不支持

---

## Test Cases（测试用例）

路由前缀：`/nexqa/api/test-cases`

### GET /nexqa/api/test-cases

获取测试用例列表。

**Query Parameters**
- `endpointId` (string, optional): 按端点过滤
- `projectId` (string, optional): 按项目过滤（通过端点关联）

**Response** `200` — `TestCase[]`
```json
[
  {
    "id": "uuid",
    "endpointId": "uuid",
    "name": "string",
    "request": {
      "method": "GET | POST | PUT | PATCH | DELETE | HEAD | OPTIONS",
      "path": "/users/1",
      "headers": {},
      "query": {},
      "body": null,
      "timeout": 30000
    },
    "expected": {
      "status": 200,
      "bodyContains": "string | null",
      "bodySchema": "JSONSchema | null"
    },
    "tags": {
      "purpose": ["functional"],
      "strategy": ["positive"],
      "phase": ["full"],
      "priority": "P1"
    },
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  }
]
```

### POST /nexqa/api/test-cases

创建测试用例。

**Request Body**
```json
{
  "endpointId": "uuid (required)",
  "name": "string (required)",
  "request": {
    "method": "GET",
    "path": "/users",
    "headers": {},
    "query": {},
    "body": null,
    "timeout": 30000
  },
  "expected": {
    "status": 200,
    "bodyContains": null,
    "bodySchema": null
  },
  "tags": {
    "purpose": ["functional"],
    "strategy": ["positive"],
    "phase": ["full"],
    "priority": "P1"
  }
}
```

**Response** `201` — 创建的 `TestCase`

### POST /nexqa/api/test-cases/update

更新测试用例。

**Request Body**
```json
{
  "id": "uuid (required)",
  "name": "string (optional)",
  "request": { ... },
  "expected": { ... },
  "tags": { ... }
}
```

**Response** `200` — 更新后的 `TestCase`

### POST /nexqa/api/test-cases/delete

删除测试用例。

**Request Body**
```json
{ "id": "uuid (required)" }
```

**Response** `200` `{ "success": true }`

### POST /nexqa/api/test-cases/generate

AI 生成测试用例（流式响应）。需要先配置 LLM。

**Request Body**
```json
{
  "endpoints": [ ... ],
  "tags": ["positive", "negative"],
  "purposes": ["functional", "security"],
  "isolationRule": true,
  "preview": false
}
```

- `endpoints` (array, required): 接口定义列表
- `tags` (string[], optional): 指定生成策略
- `purposes` (string[], optional): 测试目的
- `isolationRule` (boolean, optional): 数据隔离模式
- `preview` (boolean, optional): 预览模式，返回 header `x-preview: true`

**Response** — SSE Data Stream

---

## Test Execution（测试执行）

路由前缀：`/nexqa/api/test`

### POST /nexqa/api/test/exec

执行单个测试用例。

**Request Body**
```json
{
  "testCase": {
    "id": "uuid",
    "endpointId": "uuid",
    "name": "string",
    "request": { "method": "GET", "path": "/users", ... },
    "expected": { "status": 200, ... }
  },
  "projectId": "uuid (required)",
  "environmentId": "uuid (optional)"
}
```

**Response** `200` — `TestResult`
```json
{
  "id": "uuid",
  "caseId": "uuid",
  "projectId": "uuid",
  "timestamp": "ISO8601",
  "request": {
    "method": "GET",
    "url": "https://api.example.com/users",
    "headers": {},
    "body": null
  },
  "response": {
    "status": 200,
    "statusText": "OK",
    "headers": {},
    "body": { ... },
    "duration": 123
  },
  "passed": true,
  "failReason": null,
  "failType": null
}
```

**failType 枚举**：`status_mismatch` | `body_mismatch` | `schema_violation` | `timeout` | `auth_failure` | `network_error` | `unknown`

### POST /nexqa/api/test/exec/batch

批量执行测试用例，创建 BatchRun 并执行所有匹配用例。

**Request Body** — `CreateBatchRunSchema`
```json
{
  "projectId": "uuid (required)",
  "name": "string (required)",
  "environmentId": "uuid | null",
  "caseIds": ["uuid", ...],
  "endpointIds": ["uuid", ...],
  "tagFilter": {
    "purpose": ["functional"],
    "strategy": ["positive"],
    "phase": ["smoke"],
    "priority": "P0"
  }
}
```

**Response** `201` — 执行完成的 `BatchRun`
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "name": "string",
  "environmentId": "uuid | null",
  "status": "completed | failed",
  "totalCases": 10,
  "passedCases": 8,
  "failedCases": 2,
  "skippedCases": 0,
  "failureBreakdown": { "status_mismatch": 1, "timeout": 1 },
  "startedAt": "ISO8601",
  "completedAt": "ISO8601",
  "createdAt": "ISO8601"
}
```

---

## Test Results（测试结果）

路由前缀：`/nexqa/api/test-results`

### GET /nexqa/api/test-results

获取测试结果列表（按时间降序）。

**Query Parameters**
- `projectId` (string, optional): 按项目过滤
- `caseId` (string, optional): 按用例过滤

**Response** `200` — `TestResult[]`

---

## Batch Runs（批次运行）

路由前缀：`/nexqa/api/batch-runs`

### POST /nexqa/api/batch-runs

创建批次运行记录（仅创建，不执行；执行请用 `/test/exec/batch`）。

**Request Body** — `CreateBatchRunSchema`（同上）

**Response** `201` — `BatchRun`（status 为 `pending`）

### GET /nexqa/api/batch-runs

获取批次运行列表（分页，按创建时间降序）。

**Query Parameters**
- `projectId` (string, required): 项目 ID
- `page` (number, optional, default: 1): 页码
- `pageSize` (number, optional, default: 20, max: 100): 每页数量

**Response** `200`
```json
{
  "items": [ BatchRun, ... ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 50,
    "totalPages": 3
  }
}
```

### GET /nexqa/api/batch-runs/detail

获取批次运行详情（含关联结果摘要）。

**Query Parameters**
- `id` (string, required): 批次运行 ID

**Response** `200` — `BatchRun` + `results: BatchRunResult[]`

### GET /nexqa/api/batch-runs/results

获取批次运行的完整测试结果列表。

**Query Parameters**
- `id` (string, required): 批次运行 ID

**Response** `200` — `(TestResult & { batchRunResultId: string })[]`

---

## Environments（环境）

路由前缀：`/nexqa/api/environments`

### GET /nexqa/api/environments

获取项目的环境列表（按 order 排序，Secret 变量已脱敏）。

**Query Parameters**
- `projectId` (string, required): 项目 ID

**Response** `200` — `Environment[]`（secret 变量值显示为 `abc***`）

### GET /nexqa/api/environments/detail

获取单个环境详情。

**Query Parameters**
- `id` (string, required): 环境 ID

**Response** `200` — `Environment`

### GET /nexqa/api/environments/health

检测环境 baseURL 连通性。

**Query Parameters**
- `id` (string, required): 环境 ID

**Response** `200`
```json
{
  "healthy": true,
  "latencyMs": 45,
  "checkedAt": "ISO8601"
}
```

### POST /nexqa/api/environments

创建环境。

**Request Body** — `CreateEnvironmentSchema`
```json
{
  "projectId": "uuid (required, body 层)",
  "name": "string (required)",
  "slug": "string (required, 小写字母+数字+连字符)",
  "baseURL": "string, URL (required)",
  "headers": {},
  "variables": {
    "API_KEY": { "value": "xxx", "secret": true, "description": "API密钥" },
    "BASE_PATH": "simple-string-value"
  },
  "isDefault": false
}
```

**Response** `201` — `Environment`

**Error** `409` — slug 重复

### POST /nexqa/api/environments/clone

克隆环境。

**Request Body**
```json
{
  "id": "uuid (required, 源环境 ID)",
  "name": "string (optional, 默认 '源名称 (副本)')",
  "slug": "string (optional, 默认 '源slug-copy')"
}
```

**Response** `201` — 克隆后的 `Environment`

**Error** `409` — slug 重复

### POST /nexqa/api/environments/update

更新环境（Secret 变量支持增量更新，未修改的保留原值）。

**Request Body** — `UpdateEnvironmentSchema` + `id`
```json
{
  "id": "uuid (required)",
  "name": "string (optional)",
  "slug": "string (optional)",
  "baseURL": "string (optional)",
  "headers": {},
  "variables": {},
  "isDefault": false
}
```

**Response** `200` — 更新后的 `Environment`

### POST /nexqa/api/environments/delete

删除环境（不允许删除默认环境）。

**Request Body**
```json
{ "id": "uuid (required)" }
```

**Response** `200` `{ "success": true }`

**Error** `400` — 尝试删除默认环境

### POST /nexqa/api/environments/reorder

批量更新环境排序。

**Request Body**
```json
{
  "orders": [
    { "id": "uuid", "order": 0 },
    { "id": "uuid", "order": 1 }
  ]
}
```

**Response** `200` `{ "updated": 2 }`

---

## Test Plans（测试方案）

路由前缀：`/nexqa/api/test-plans`

### GET /nexqa/api/test-plans

获取项目的测试方案列表（按 updatedAt 降序）。

**Query Parameters**
- `projectId` (string, required): 项目 ID

**Response** `200` — `TestPlan[]`

### POST /nexqa/api/test-plans

创建测试方案。

**Request Body** — `CreateTestPlanSchema`
```json
{
  "projectId": "uuid (required)",
  "name": "string (required)",
  "description": "string",
  "selection": {
    "tags": {
      "purpose": ["functional"],
      "strategy": ["positive", "negative"],
      "phase": ["smoke"],
      "priority": ["P0", "P1"]
    },
    "endpointIds": ["uuid"],
    "chainIds": ["uuid"],
    "caseIds": ["uuid"]
  },
  "execution": {
    "environmentId": "uuid | null",
    "stages": true,
    "concurrency": 3,
    "retryOnFail": 0,
    "timeoutMs": 30000,
    "stopOnGateFail": true
  },
  "criteria": {
    "minPassRate": 0.95,
    "maxP0Fails": 0,
    "maxP1Fails": 3
  }
}
```

**Response** `201` — `TestPlan`

### GET /nexqa/api/test-plans/detail

获取测试方案详情。

**Query Parameters**
- `id` (string, required): 方案 ID

**Response** `200` — `TestPlan`

### POST /nexqa/api/test-plans/update

更新测试方案。

**Request Body** — `UpdateTestPlanSchema` + `id`
```json
{
  "id": "uuid (required)",
  "name": "string (optional)",
  "description": "string (optional)",
  "selection": { ... },
  "execution": { ... },
  "criteria": { ... }
}
```

**Response** `200` — 更新后的 `TestPlan`

### POST /nexqa/api/test-plans/delete

删除测试方案。

**Request Body**
```json
{ "id": "uuid (required)" }
```

**Response** `200` `{ "success": true }`

### POST /nexqa/api/test-plans/run

执行测试方案。

**Request Body**
```json
{ "id": "uuid (required)" }
```

**Response** `200` — 方案执行结果

---

## Test Chains（测试链）

路由前缀：`/nexqa/api/test-chains`

### GET /nexqa/api/test-chains

获取项目的测试链列表（按 updatedAt 降序）。

**Query Parameters**
- `projectId` (string, required): 项目 ID

**Response** `200` — `TestChain[]`
```json
[
  {
    "id": "uuid",
    "projectId": "uuid",
    "name": "string",
    "description": "string",
    "steps": [
      {
        "id": "uuid",
        "caseId": "uuid",
        "label": "string",
        "extractors": [
          { "varName": "userId", "source": "body", "expression": "$.id", "required": true }
        ],
        "injectors": [
          { "varName": "userId", "target": "path", "expression": ":id" }
        ],
        "delay": 0,
        "overrides": { "headers": {}, "query": {} }
      }
    ],
    "config": {
      "continueOnFail": false,
      "cleanupSteps": []
    },
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  }
]
```

### POST /nexqa/api/test-chains

创建测试链。

**Request Body** — `CreateTestChainSchema`
```json
{
  "projectId": "uuid (required)",
  "name": "string (required)",
  "description": "string",
  "steps": [
    {
      "caseId": "uuid",
      "label": "string",
      "extractors": [],
      "injectors": [],
      "delay": 0,
      "overrides": {}
    }
  ],
  "config": {
    "continueOnFail": false,
    "cleanupSteps": []
  }
}
```

**Response** `201` — `TestChain`

### GET /nexqa/api/test-chains/detail

获取测试链详情。

**Query Parameters**
- `id` (string, required): 测试链 ID

**Response** `200` — `TestChain`

### POST /nexqa/api/test-chains/update

更新测试链。

**Request Body** — `UpdateTestChainSchema` + `id`
```json
{
  "id": "uuid (required)",
  "name": "string (optional)",
  "description": "string (optional)",
  "steps": [ ... ],
  "config": { ... }
}
```

**Response** `200` — 更新后的 `TestChain`

### POST /nexqa/api/test-chains/delete

删除测试链。

**Request Body**
```json
{ "id": "uuid (required)" }
```

**Response** `200` `{ "success": true }`

### POST /nexqa/api/test-chains/run

执行测试链（步骤串联执行，支持变量提取与注入）。

**Request Body**
```json
{
  "id": "uuid (required)",
  "environmentId": "uuid (optional)"
}
```

**Response** `200` — 链执行结果

---

## Coverage（覆盖率）

路由前缀：`/nexqa/api/coverage`

### GET /nexqa/api/coverage

计算项目的测试覆盖率。

**Query Parameters**
- `projectId` (string, required): 项目 ID

**Response** `200`
```json
{
  "endpoints": [ ... ],
  "details": {
    "totalEndpoints": 20,
    "coveredEndpoints": 15,
    "totalMethods": 30,
    "coveredMethods": 22,
    "totalStatusCodes": 50,
    "coveredStatusCodes": 35
  },
  "matrix": [ ... ],
  "suggestions": [ ... ]
}
```

---

## Reports（报告）

路由前缀：`/nexqa/api/reports`

### GET /nexqa/api/reports

获取项目的报告列表。

**Query Parameters**
- `projectId` (string, required): 项目 ID

**Response** `200` — 报告列表

### GET /nexqa/api/reports/detail

获取报告详情。

**Query Parameters**
- `id` (string, required): 报告 ID

**Response** `200` — 报告对象

**Error** `404` `{ "error": "Report not found" }`

### GET /nexqa/api/reports/export

导出报告为指定格式。

**Query Parameters**
- `id` (string, required): 报告 ID
- `format` (string, optional, default: `json`): 导出格式 — `markdown` | `html` | `junit` | `json`

**Response** — 对应格式的文件内容（含 `Content-Disposition` header）

---

## Analysis（AI 分析）

路由前缀：`/nexqa/api/analysis`

### POST /nexqa/api/analysis/batch

AI 分析批次中的所有失败。

**Request Body**
```json
{
  "batchRunId": "uuid (required)",
  "force": false
}
```

- `force` (boolean, optional): 强制重新分析

**Response** `200` — `FailureAnalysis` 分析结果

### POST /nexqa/api/analysis/batch/result

获取批次的已缓存分析结果。

**Request Body**
```json
{ "batchRunId": "uuid (required)" }
```

**Response** `200` — `FailureAnalysis`

**Error** `404` `{ "error": "Analysis not found" }`

### POST /nexqa/api/analysis/case

AI 分析单条失败结果。

**Request Body**
```json
{ "testResultId": "uuid (required)" }
```

**Response** `200` — 单例分析结果

### POST /nexqa/api/analysis/case/result

获取单条结果的已缓存分析。

**Request Body**
```json
{ "testResultId": "uuid (required)" }
```

**Response** `200`
```json
{
  "analysisId": "uuid",
  "batchRunId": "uuid",
  "group": "string",
  "suggestion": "string",
  "resultId": "uuid",
  "caseId": "uuid"
}
```

**Error** `404`

---

## Smoke Test（冒烟测试）

路由前缀：`/nexqa/api/smoke`

### POST /nexqa/api/smoke/generate

AI 生成冒烟测试方案（不执行）。

**Request Body**
```json
{ "projectId": "uuid (required)" }
```

**Response** `200`
```json
{
  "corePaths": [ ... ],
  "totalCases": 5,
  "selectedCaseIds": ["uuid", ...],
  "executionOrder": [ ... ],
  "reasoning": { "corePaths": [ ... ] }
}
```

### POST /nexqa/api/smoke/execute

执行冒烟测试（异步，AI 分析 → 选用例 → 执行）。

**Request Body**
```json
{
  "projectId": "uuid (required)",
  "environmentId": "uuid (optional)"
}
```

**Response** `202`
```json
{
  "taskId": "uuid",
  "batchRunId": "uuid",
  "status": "string",
  "message": "AI 正在分析 API 文档，识别核心路径..."
}
```

### GET /nexqa/api/smoke/status

查询冒烟测试进度。

**Query Parameters**
- `taskId` (string, required): 任务 ID

**Response** `200` — 任务状态对象

**Error** `404` `{ "error": "Smoke test task not found" }`

---

## Fetch URL（URL 抓取）

路由前缀：`/nexqa/api/fetch-url`

### POST /nexqa/api/fetch-url

抓取 URL 内容并提取正文文本。

**Request Body**
```json
{ "url": "string (required)" }
```

**Response** `200`
```json
{ "content": "提取的正文内容..." }
```

**Error** `400` — 抓取失败或内容过少

---

## OpenClaw（集成）

路由前缀：`/nexqa/api/openclaw`

### POST /nexqa/api/openclaw/proxy-sign-challenge

代理签名挑战请求到 ClawRunner。

**Request Body**
```json
{
  "clawRunnerUrl": "string (required)",
  "nonce": "string (required)"
}
```

**Response** `200` — 上游返回的签名结果

**Error** `502` — 代理请求失败

### GET /nexqa/api/openclaw/oss-config

获取 OSS 配置（不含密钥）。

**Response** `200`
```json
{
  "configured": true,
  "endpoint": "https://s3.cn-north-1.jdcloud-oss.com",
  "bucket": "joyos",
  "region": "cn-north-1"
}
```

### POST /nexqa/api/openclaw/oss-config/update

更新 OSS 配置。

**Request Body**
```json
{
  "endpoint": "string",
  "accessKey": "string",
  "secretKey": "string",
  "bucket": "string",
  "region": "string"
}
```

**Response** `200` `{ "ok": true }`

### POST /nexqa/api/openclaw/upload-image

上传图片到 OSS（FormData）。

**Request Body** — `multipart/form-data`
- `file` (File, required): 上传的文件

**Response** `200`
```json
{
  "url": "预签名 URL（7天有效）",
  "key": "dev/claw-runner/temp-files/...",
  "mime": "image/png"
}
```

### WebSocket: /nexqa/api/openclaw/ws-proxy

WebSocket 代理（通过 HTTP Upgrade）。

**Query Parameters**
- `target` (string, required): 目标 WebSocket URL（`ws://` 或 `wss://`）

功能：双向转发 WebSocket 帧，去除浏览器 Origin header。

---

## Chain Generation（链生成）

路由前缀：`/nexqa/api/chain-gen`

### GET /nexqa/api/chain-gen/status

查询链生成任务进度。

**Query Parameters**
- `taskId` (string, required): 任务 ID

**Response** `200` — 任务状态对象

**Error** `404` `{ "error": "Chain generation task not found" }`

---

## Webhooks（Webhook 接收）

路由前缀：`/nexqa/api/webhooks`

### POST /nexqa/api/webhooks/github

接收 GitHub Webhook 事件（push / pull_request / ping）。

**Required Headers**
- `X-Hub-Signature-256` (string): GitHub HMAC 签名
- `X-GitHub-Event` (string): 事件类型

**Request Body** — GitHub Webhook Payload

**Response**
- `202` — 触发了规则
```json
{
  "triggered": true,
  "executionId": "uuid",
  "matchedRules": [ ... ],
  "message": "Triggered 2 rule(s)"
}
```
- `200` — 未匹配规则 `{ "triggered": false, "message": "..." }`
- `401` — 签名验证失败

### POST /nexqa/api/webhooks/gitlab

接收 GitLab Webhook 事件。

**Required Headers**
- `X-Gitlab-Token` (string): GitLab Secret Token

**Request Body** — `GitLabPushPayload`

**Response** — 同 GitHub（`202` 触发 / `200` 未触发 / `401` 验证失败）

### POST /nexqa/api/webhooks/trigger

通用手动触发端点。

**Required Headers**
- `Authorization: Bearer <token>`

**Request Body**
```json
{
  "projectId": "uuid (required)",
  "type": "smoke | regression | security | full (required)",
  "env": "string (optional, 环境 slug)"
}
```

**Response** `202`
```json
{
  "executionId": "uuid",
  "number": 1,
  "status": "running",
  "message": "smoke test triggered"
}
```

---

## Project Regression（回归测试）

路由前缀：`/nexqa/api/projects`（挂载在 projects 路由下）

### POST /nexqa/api/projects/api-diff

上传新 API Spec 进行 diff 分析。

**Request Body**
```json
{
  "projectId": "uuid (required)",
  "specContent": "string (required, 新版 OpenAPI spec)",
  "oldSpecContent": "string (optional, 旧版 spec，不传则与最新存储版本比对)",
  "version": "string (optional)",
  "source": "manual | webhook | git (optional, default: manual)"
}
```

**Response** `200`
```json
{
  "id": "uuid",
  "diffId": "uuid",
  "summary": { "added": 2, "removed": 1, "modified": 3, "breaking": 1 },
  "added": [ ... ],
  "removed": [ ... ],
  "modified": [ ... ],
  "impact": { ... }
}
```

首次上传（无历史版本）返回：
```json
{
  "message": "First version stored. Upload another version to generate diff.",
  "versionId": "uuid",
  "endpointCount": 15
}
```

### GET /nexqa/api/projects/api-diff/impact

获取 diff 的影响分析。

**Query Parameters**
- `diffId` (string, required): Diff 结果 ID

**Response** `200`
```json
{
  "diffId": "uuid",
  "diff": { ... },
  "impact": { ... }
}
```

### POST /nexqa/api/projects/api-diff/analyze-impact

触发影响分析（重新分析）。

**Request Body**
```json
{
  "projectId": "uuid (required)",
  "diffId": "uuid (required)"
}
```

**Response** `200` — 含 diff 和 impact

### POST /nexqa/api/projects/api-diff/generate-regression

从 diff 生成回归方案（可选 LLM 增强）。

**Request Body**
```json
{
  "projectId": "uuid (required)",
  "diffId": "uuid (required)",
  "environmentId": "uuid (optional)",
  "autoAdjust": true
}
```

**Response** `200` — `RegressionPlan`
```json
{
  "regressionId": "uuid",
  "id": "uuid",
  "projectId": "uuid",
  "diffId": "uuid",
  "changeSummary": { "added": 2, "modified": 3, "removed": 1, "breaking": 1 },
  "confidence": 0.85,
  "directCaseIds": ["uuid", ...],
  "indirectChainIds": ["uuid", ...],
  "smokeCaseIds": ["uuid", ...],
  "newCaseIds": [],
  "adjustments": [ ... ],
  "execution": {
    "environmentId": "uuid",
    "concurrency": 1,
    "retryOnFail": 1,
    "timeoutMs": 30000,
    "minPassRate": 0.95
  },
  "reasoning": "string",
  "createdAt": "ISO8601"
}
```

### GET /nexqa/api/projects/regression/detail

获取回归方案详情。

**Query Parameters**
- `regressionId` (string, required): 回归方案 ID

**Response** `200` — `RegressionPlan`

### POST /nexqa/api/projects/regression/execute

执行回归方案（创建 BatchRun）。

**Request Body**
```json
{
  "projectId": "uuid (required)",
  "regressionId": "uuid (required)",
  "environmentId": "uuid (optional)"
}
```

**Response** `202`
```json
{
  "batchRunId": "uuid",
  "regressionId": "uuid",
  "caseCount": 15,
  "status": "pending",
  "message": "回归方案已创建，包含 15 个用例待执行"
}
```

---

## Project Security（安全扫描）

### POST /nexqa/api/projects/security-scan

启动安全扫描。

路由前缀：`/nexqa/api/projects`

**Request Body**
```json
{
  "projectId": "uuid (required)",
  "environmentId": "uuid (required)",
  "scope": "all | selected (optional, default: all)",
  "endpointIds": ["uuid", ...],
  "testTypes": ["sql-injection", "xss", "auth-bypass", ...]
}
```

**支持的 testTypes**：`sql-injection` | `xss` | `path-traversal` | `auth-bypass` | `idor` | `mass-assignment` | `rate-limit` | `info-disclosure` | `ssrf` | `command-injection` | `overflow`

**Response** `202`
```json
{
  "scanId": "uuid",
  "status": "string",
  "message": "AI 正在分析 API 攻击面..."
}
```

### GET /nexqa/api/security-scan

查询扫描进度。

路由前缀：`/nexqa/api/security-scan`

**Query Parameters**
- `scanId` (string, required): 扫描 ID

**Response** `200`
```json
{
  "id": "uuid",
  "status": "string",
  "progress": 0.75,
  "attackSurfaces": [ ... ],
  "generatedCaseIds": ["uuid", ...],
  "batchRunId": "uuid | null",
  "error": null,
  "createdAt": "ISO8601",
  "completedAt": "ISO8601 | null"
}
```

### GET /nexqa/api/security-scan/report

获取安全扫描报告。

**Query Parameters**
- `scanId` (string, required): 扫描 ID

**Response** `200` — 安全报告

**Error** `409` — 扫描尚未完成

### GET /nexqa/api/security-scan/surface

获取攻击面分析。

**Query Parameters**
- `scanId` (string, required): 扫描 ID

**Response** `200`
```json
{
  "projectId": "uuid",
  "attackSurfaces": [ ... ],
  "totalVectors": 25
}
```

---

## Project Plan Generation（方案生成）

路由前缀：`/nexqa/api/projects`

### GET /nexqa/api/projects/plan-gen/templates

获取预置方案模板列表。

**Response** `200` — 模板列表

### POST /nexqa/api/projects/plan-gen/generate

根据自然语言意图 AI 生成测试方案。

**Request Body**
```json
{
  "projectId": "uuid (required)",
  "intent": "string (required, 自然语言描述)",
  "environmentId": "uuid (optional)"
}
```

**Response** `200` — 生成的方案

### POST /nexqa/api/projects/plan-gen/adopt

采纳生成的方案，创建正式 TestPlan。

**Request Body**
```json
{
  "generationId": "uuid (required)",
  "modifications": { ... }
}
```

**Response** `201` — 创建的 `TestPlan`

---

## Project Trends（趋势分析）

路由前缀：`/nexqa/api/projects`

### GET /nexqa/api/projects/trend-insights

获取趋势洞察。

**Query Parameters**
- `projectId` (string, required): 项目 ID

**Response** `200` — 洞察结果

### GET /nexqa/api/projects/quality-risks

获取质量风险预警。

**Query Parameters**
- `projectId` (string, required): 项目 ID

**Response** `200` — 风险列表

### POST /nexqa/api/projects/quality-risks/dismiss

忽略风险预警。

**Request Body**
```json
{ "riskId": "uuid (required)" }
```

**Response** `200` `{ "success": true }`

### POST /nexqa/api/projects/trend-analysis

触发趋势 AI 分析。

**Request Body**
```json
{
  "projectId": "uuid (required)",
  "timeRange": "30d (optional, 格式: Nd)",
  "force": false
}
```

**Response** `200` — 分析结果

---

## Project CI/CD（持续集成）

路由前缀：`/nexqa/api/projects`

### GET /nexqa/api/projects/webhook-config

获取项目 Webhook 配置（token 已脱敏）。

**Query Parameters**
- `projectId` (string, required): 项目 ID

**Response** `200` — Webhook 配置（incoming token 部分隐藏）

### POST /nexqa/api/projects/webhook-config/regenerate-token

重新生成 Webhook Token。

**Request Body**
```json
{ "projectId": "uuid (required)" }
```

**Response** `200`
```json
{
  "token": "完整 token（仅此一次可见）",
  "tokenCreatedAt": "ISO8601",
  "message": "Token regenerated. This is the only time the full token will be shown."
}
```

### POST /nexqa/api/projects/outgoing-webhooks

添加出站 Webhook。

**Request Body**
```json
{
  "projectId": "uuid (required)",
  "name": "string (required)",
  "url": "string (required)",
  ...
}
```

**Response** `201` — 创建的 `OutgoingWebhook`

### POST /nexqa/api/projects/outgoing-webhooks/delete

删除出站 Webhook。

**Request Body**
```json
{
  "projectId": "uuid (required)",
  "id": "uuid (required)"
}
```

**Response** `200` `{ "success": true }`

### POST /nexqa/api/projects/outgoing-webhooks/test

测试出站 Webhook（发送测试通知）。

**Request Body**
```json
{
  "projectId": "uuid (required)",
  "id": "uuid (required)"
}
```

**Response** `200`
```json
{
  "success": true,
  "status": "...",
  "message": "Test notification sent to webhook-name"
}
```

### GET /nexqa/api/projects/trigger-rules

获取触发规则列表。

**Query Parameters**
- `projectId` (string, required): 项目 ID

**Response** `200` — `TriggerRule[]`

### POST /nexqa/api/projects/trigger-rules

创建触发规则。

**Request Body**
```json
{
  "projectId": "uuid (required)",
  "name": "string (required)",
  "trigger": { "type": "string (required)", ... },
  "action": { "type": "string (required)", ... },
  ...
}
```

**Response** `201` — `TriggerRule`

### POST /nexqa/api/projects/trigger-rules/toggle

切换触发规则启用状态。

**Request Body**
```json
{ "id": "uuid (required)" }
```

**Response** `200` — 切换后的 `TriggerRule`

### POST /nexqa/api/projects/trigger-rules/delete

删除触发规则。

**Request Body**
```json
{ "id": "uuid (required)" }
```

**Response** `200` `{ "success": true }`

### GET /nexqa/api/projects/cicd-executions

获取 CI/CD 执行历史。

**Query Parameters**
- `projectId` (string, required): 项目 ID
- `triggerType` (string, optional): 按触发类型过滤
- `result` (string, optional): 按结果过滤
- `limit` (number, optional, default: 50): 返回数量

**Response** `200`
```json
{
  "items": [ CIExecution, ... ],
  "summary": {
    "total": 20,
    "passed": 15,
    "failed": 4,
    "errors": 1,
    "avgPassRate": 0.85,
    "avgDurationMs": 12500
  }
}
```

---

## Project Chain Generation（链生成）

路由前缀：`/nexqa/api/projects`

### POST /nexqa/api/projects/chain-gen/analyze

AI 分析 API 数据依赖关系（异步）。

**Request Body**
```json
{
  "projectId": "uuid (required)",
  "scope": "all | selected (optional, default: all)",
  "endpointIds": ["uuid", ...]
}
```

**Response** `202`
```json
{
  "taskId": "uuid",
  "status": "string",
  "message": "AI 正在分析 API 数据依赖关系..."
}
```

### POST /nexqa/api/projects/chain-gen/generate

AI 分析并生成测试链（异步，与 analyze 逻辑相同）。

**Request Body**（同 analyze）

**Response** `202`
```json
{
  "taskId": "uuid",
  "status": "string",
  "message": "AI 正在分析 API 数据依赖关系并生成测试链..."
}
```

### POST /nexqa/api/projects/chain-gen/adopt

采纳生成的测试链。

**Request Body**
```json
{
  "projectId": "uuid (required)",
  "taskId": "uuid (required)",
  "chainIndexes": [0, 1, 2],
  "modifications": { ... }
}
```

**Response** `201`
```json
{ "adopted": [ TestChain, ... ] }
```

---

## Project Environments（环境排序）

路由前缀：`/nexqa/api/projects`

### POST /nexqa/api/projects/environments/reorder

批量更新项目环境排序（项目级别入口）。

**Request Body**
```json
{
  "projectId": "uuid (required)",
  "orders": [
    { "id": "uuid", "order": 0 },
    { "id": "uuid", "order": 1 }
  ]
}
```

**Response** `200` `{ "updated": 2 }`

---

## 全局错误处理

所有端点共享统一的错误处理：

### Zod 验证错误 → `400`
```json
{ "error": "name: Required; baseURL: Invalid url" }
```

### 未处理异常 → `500`
```json
{ "error": "Internal Server Error" }
```

---

## 数据模型速查

### Tags 结构
```typescript
{
  purpose: ("functional" | "auth" | "data-integrity" | "security" | "idempotent" | "performance")[]
  strategy: ("positive" | "negative" | "boundary" | "destructive")[]
  phase: ("smoke" | "regression" | "full" | "targeted")[]
  priority: "P0" | "P1" | "P2" | "P3"
}
```

### FailType 枚举
`status_mismatch` | `body_mismatch` | `schema_violation` | `timeout` | `auth_failure` | `network_error` | `unknown`

### BatchRun Status 枚举
`pending` | `running` | `completed` | `failed`

### Variable 格式
```typescript
// 简单字符串（兼容旧版）
{ "KEY": "value" }

// 完整格式（支持 Secret）
{
  "KEY": {
    "value": "string",
    "secret": false,
    "description": "说明"
  }
}
```
