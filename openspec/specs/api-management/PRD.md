# NexQA API 管理模块 — 产品需求文档 (PRD)

> 版本: 1.0
> 创建日期: 2026-04-13
> 作者: 星析 (Xingxi)

---

## 1. 问题定义

### 1.1 背景

NexQA 当前的 API 导入功能嵌在测试用例模块内，用户上传 API 文档后直接生成测试用例，没有独立的 API 管理层。这导致以下问题：

| 问题 | 影响 |
|------|------|
| API 文档无法独立维护 | 无法查看、编辑已导入的 API 定义 |
| 无法检测 API 变更 | 重新上传同一文档时，不知道哪些接口变了 |
| API 与测试用例关联不透明 | 不知道哪些用例关联了哪个 API |
| 变更影响不可见 | API 变更后，关联的测试用例不知道是否需要更新 |

### 1.2 目标用户

- 测试工程师：维护 API 文档，基于 API 创建测试用例
- 开发工程师：查看 API 定义，了解接口变更

### 1.3 核心价值

将 API 管理独立为一级模块，实现：
1. **API 文档统一管理** — 上传、解析、存储、查看、编辑
2. **变更检测与追踪** — 自动检测 API 变更，标记受影响的测试用例
3. **API ↔ 用例双向关联** — 清晰展示关联关系

---

## 2. 功能需求列表

### P0 — MVP 必做

| ID | 功能 | 描述 |
|----|------|------|
| F1 | API 文档上传与解析 | 复用现有 parser，支持 5 种格式导入，持久化存储 |
| F2 | API 列表展示 | 按文档分组展示所有 API 端点 |
| F3 | API 详情查看 | 展示单个 API 完整定义 |
| F4 | API 编辑与删除 | 修改 API 属性，删除不需要的 API |
| F5 | 变更检测 | 重新上传同一文档时，对比差异并展示 |
| F6 | API ↔ 测试用例关联 | 导入时建立关联，支持手动修改 |

### P1 — 重要但可后续迭代

| ID | 功能 | 描述 |
|----|------|------|
| F7 | 变更确认流程 | 用户确认变更后才更新 API，可选保留旧版本 |
| F8 | 批量操作 | 批量删除、批量导出 |
| F9 | API 搜索与过滤 | 按路径、方法、标签过滤 |

### P2 — 后续优化

| ID | 功能 | 描述 |
|----|------|------|
| F10 | API 版本历史 | 保留历史版本，支持回滚 |
| F11 | API 标签管理 | 自定义标签分类 |

---

## 3. 验收标准 (AC)

### F1: API 文档上传与解析

```
Given 用户进入「API 管理」模块
When 用户点击「导入 API」并选择文件/粘贴内容/输入 URL
Then 系统解析文档，展示识别到的 API 端点列表，格式显示为 OpenAPI 3.x/Swagger 2.0/Postman/HAR/cURL 之一
And 用户可选择部分或全部端点导入
And 导入成功后端点持久化存储，出现在 API 列表中
```

```
Given 用户上传了不支持格式的文件
When 解析失败
Then 显示错误提示"不支持的格式，支持：OpenAPI 3.x、Swagger 2.0、Postman Collection、HAR、cURL"
```

### F2: API 列表展示

```
Given 项目中已导入 API 文档
When 用户进入「API 管理」页面
Then 页面按文档分组展示所有 API 端点
And 每个端点显示：方法、路径、摘要、关联用例数
And 支持展开/折叠文档分组
```

### F3: API 详情查看

```
Given API 列表中存在某个端点
When 用户点击该端点
Then 右侧或弹窗展示完整 API 定义：method、path、summary、headers、queryParams、pathParams、body、responses
And 显示关联的测试用例列表（如有）
```

### F4: API 编辑与删除

```
Given 用户正在查看某个 API 详情
When 用户点击「编辑」并修改 summary 或其他字段
Then 修改保存成功，updatedAt 时间更新
```

```
Given 用户正在查看某个 API 详情
When 用户点击「删除」并确认
Then 该 API 被删除
And 关联的测试用例的 endpointId 置空或标记为"API 已删除"
```

### F5: 变更检测

```
Given 用户之前已导入文档 A
When 用户再次上传同一份文档 A（内容有变更）
Then 系统对比新旧端点，展示 diff：
    - 新增的端点（绿色标记）
    - 删除的端点（红色标记）
    - 修改的端点（黄色标记，显示具体变更）
And 用户可选择：
    - 确认更新：用新端点更新数据库
    - 取消：保持原状
```

```
Given 变更检测发现 breaking changes（如删除端点、必填参数变更）
When 展示 diff 结果
Then breaking changes 单独标记为红色警示
```

### F6: API ↔ 测试用例关联

```
Given 用户从 API 管理导入 API 端点
When 导入成功
Then 系统自动创建 endpointId → testCase 的关联关系
```

```
Given 某个 API 端点已关联测试用例
When 用户在 API 详情页查看
Then 显示关联的测试用例列表，每个用例可点击跳转
```

```
Given 某个 API 发生了变更（用户确认更新后）
When 变更检测完成
Then 所有关联该 API 的测试用例标记为"待更新"状态
And 在测试用例列表、用例详情页显示"API 已变更"提醒
```

```
Given 用户想修改 API 与测试用例的关联
When 用户在测试用例编辑页选择"关联 API"
Then 可从 API 列表中搜索并选择要关联的 API
And 保存后关联关系更新
```

---

## 4. 页面流程

### 4.1 页面清单

| 页面 | URL | 说明 |
|------|-----|------|
| API 管理首页 | `/p/:projectId/api` | API 文档列表 + 端点列表 |
| API 详情 | `/p/:projectId/api/:endpointId` | 单个 API 完整定义 |
| 导入 API | `/p/:projectId/api/import` | 上传/粘贴/URL 导入 |
| 变更确认 | Modal/Sheet | 展示 diff，用户确认更新 |

### 4.2 用户操作路径

```
┌─────────────────────────────────────────────────────────────┐
│                     API 管理首页                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 文档: petstore-v3.json (OpenAPI 3.x)        [更新] │    │
│  │   GET /pets ─────────────────── 3 用例    [查看]   │    │
│  │   POST /pets ────────────────── 1 用例    [查看]   │    │
│  │   GET /pets/{id} ────────────── 2 用例    [查看]   │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 文档: user-api.har (HAR)                     [更新]│    │
│  │   GET /users ─────────────────── 0 用例    [查看]   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [+ 导入 API]                                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ 点击「导入 API」或「更新」
┌─────────────────────────────────────────────────────────────┐
│                     导入 API 页面                            │
│                                                             │
│  [粘贴内容] [URL] [上传文件]                                 │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 粘贴 OpenAPI/Swagger/Postman/HAR/cURL 内容...       │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [解析]                                                     │
│                                                             │
│  ───────────────── 解析结果 ─────────────────               │
│  ☑ GET /pets        ─ 查询宠物列表                         │
│  ☑ POST /pets       ─ 创建宠物                             │
│  ☑ GET /pets/{id}   ─ 获取宠物详情                         │
│                                                             │
│  [全选] [全不选]              [导入选中 (3)]                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ 如果是更新已有文档
┌─────────────────────────────────────────────────────────────┐
│                   变更确认 (Modal)                           │
│                                                             │
│  检测到 2 处变更：                                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🟢 新增   POST /pets/{id}/adopt  收养宠物           │    │
│  │ 🔴 删除   DELETE /pets/{id}                        │    │
│  │ 🟡 修改   GET /pets                                │    │
│  │         - 新增必填参数 'status' (breaking)          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  受影响测试用例：                                           │
│  • 查询宠物列表-正常 (待更新)                               │
│  • 删除宠物-异常处理 (API 已删除)                           │
│                                                             │
│  [取消]                          [确认更新]                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. 核心交互说明

### 5.1 变更检测流程

```
用户上传文档
    │
    ▼
系统检测是否为已存在的文档
    │
    ├── 新文档 → 直接导入
    │
    └── 已存在的文档 → 执行 diff
                            │
                            ▼
                    调用 api-diff-service
                    对比新旧端点
                            │
                            ▼
                    展示 diff 结果
                    (新增/删除/修改)
                            │
                            ▼
                    用户确认？
                    ├── 否 → 取消，保持原状
                    └── 是 → 更新 API 数据
                              │
                              ▼
                        标记关联用例为"待更新"
```

**diff 判断逻辑：**
- 文档标识：使用 `文档名称 + 格式` 作为唯一标识，或让用户选择要更新的文档
- 端点对比：`method + path` 作为端点唯一键

**变更类型：**

| 类型 | 条件 | 影响 |
|------|------|------|
| 新增端点 | 新端点不存在于旧列表 | 无影响 |
| 删除端点 | 旧端点不存在于新列表 | 关联用例标记"API 已删除" |
| 修改端点 | 参数/响应/请求体有变化 | 关联用例标记"待更新" |
| Breaking | 删除端点/新增必填参数/删除响应字段 | 红色警示 |

### 5.2 关联管理流程

```
┌─────────────────────────────────────────────────────┐
│              API ↔ 测试用例关联                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  导入 API 时：                                      │
│  ┌───────────────┐      ┌───────────────┐          │
│  │ API Endpoint  │─────▶│ 自动创建关联   │          │
│  └───────────────┘      └───────────────┘          │
│         │                      │                    │
│         │                      ▼                    │
│         │              test-case.endpointId         │
│         │              = api-endpoint.id            │
│         │                                           │
│  API 变更时：                                       │
│  ┌───────────────┐      ┌───────────────┐          │
│  │ API 变更检测   │─────▶│ 查询关联用例   │          │
│  └───────────────┘      └───────────────┘          │
│                                │                    │
│                                ▼                    │
│                        testCase.status = 'pending-update'
│                        testCase.apiChangeFlag = {变更详情}
│                                                     │
│  展示用例时：                                       │
│  ┌───────────────┐      ┌───────────────┐          │
│  │ 渲染用例列表   │─────▶│ 检查 apiChangeFlag│       │
│  └───────────────┘      └───────────────┘          │
│                                │                    │
│                                ▼                    │
│                        显示"API 已变更"徽章          │
│                                                     │
│  手动修改关联：                                     │
│  ┌───────────────┐      ┌───────────────┐          │
│  │ 编辑测试用例   │─────▶│ 选择关联 API   │          │
│  └───────────────┘      └───────────────┘          │
│                                │                    │
│                                ▼                    │
│                        更新 endpointId              │
│                        清除 apiChangeFlag           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 6. 数据关系说明

### 6.1 实体关系图 (ER)

```
┌─────────────────────┐       ┌─────────────────────┐
│    ApiDocument      │       │    ApiEndpoint      │
├─────────────────────┤       ├─────────────────────┤
│ id: uuid            │──────▶│ id: uuid            │
│ projectId: uuid     │ 1:N   │ projectId: uuid     │
│ name: string        │       │ documentId: uuid ◀──┤
│ format: ApiFormat   │       │ method: HttpMethod  │
│ source: string?     │       │ path: string        │
│ contentHash: string │       │ summary: string     │
│ createdAt: datetime │       │ headers: Param[]    │
│ updatedAt: datetime │       │ queryParams: Param[]│
└─────────────────────┘       │ pathParams: Param[] │
                              │ body: BodyDef?      │
                              │ responses: Resp[]   │
                              │ createdAt: datetime │
                              │ updatedAt: datetime │
                              └─────────────────────┘
                                        │
                                        │ 1:N
                                        ▼
                              ┌─────────────────────┐
                              │     TestCase        │
                              ├─────────────────────┤
                              │ id: uuid            │
                              │ endpointId: uuid ◀──┤ FK，可为空
                              │ name: string        │
                              │ request: RequestDef │
                              │ expected: Expected  │
                              │ tags: Tags          │
                              │ apiChangeFlag: {}?  │─── 变更标记
                              │ createdAt: datetime │
                              │ updatedAt: datetime │
                              └─────────────────────┘
```

### 6.2 新增数据模型

#### ApiDocument (新增)

```typescript
interface ApiDocument {
  id: string;              // uuid
  projectId: string;       // 所属项目
  name: string;            // 文档名称（从文件名或 URL 推断）
  format: ApiFormat;       // 'openapi3' | 'swagger2' | 'postman-v2' | 'har' | 'curl'
  source?: string;         // 来源 URL（如有）
  contentHash: string;     // 文档内容 hash，用于变更检测
  endpointCount: number;   // 包含的端点数量
  createdAt: string;       // ISO datetime
  updatedAt: string;       // ISO datetime
}
```

#### ApiEndpoint 扩展字段

```typescript
interface ApiEndpoint {
  // ... 现有字段保持不变 ...
  documentId: string;      // 新增：所属文档 ID
}
```

#### TestCase 扩展字段

```typescript
interface TestCase {
  // ... 现有字段保持不变 ...
  apiChangeFlag?: {        // 新增：API 变更标记
    changedAt: string;     // 变更时间
    changeType: 'modified' | 'deleted';
    changes?: FieldChange[]; // 具体变更内容
  };
}
```

### 6.3 存储位置

| 实体 | Collection | 文件路径 |
|------|------------|----------|
| ApiDocument | `api-documents` | `data/api-documents/{id}.json` |
| ApiEndpoint | `api-endpoints` | `data/api-endpoints/{id}.json` |
| TestCase | `test-cases` | `data/test-cases/{id}.json` |

---

## 7. API 接口契约

### 7.1 新增接口

#### 获取文档列表
```
GET /api-documents?projectId={projectId}

Response: ApiDocument[]
```

#### 导入 API（增强）
```
POST /api-documents/import
Body: {
  projectId: string;
  name?: string;           // 文档名称，可选
  content: string;         // 文档内容
  source?: string;         // 来源 URL
}
Response: {
  document: ApiDocument;
  endpoints: ApiEndpoint[];
  isUpdate: boolean;       // 是否为更新已有文档
  diff?: ApiDiffResult;    // 如果是更新，返回 diff 结果
}
```

#### 确认变更更新
```
POST /api-documents/{id}/confirm-update
Body: {
  acceptAdded: string[];   // 接受的新增端点 ID（临时 ID）
  acceptModified: string[]; // 接受的修改端点 ID
  acceptRemoved: string[]; // 接受删除的端点 ID
}
Response: {
  updated: ApiEndpoint[];
  deleted: string[];
  affectedCases: TestCase[];
}
```

#### 获取端点详情
```
GET /api-endpoints/{id}

Response: ApiEndpoint & {
  testCases: TestCase[];   // 关联的测试用例
}
```

#### 更新端点
```
POST /api-endpoints/{id}/update
Body: Partial<ApiEndpoint>

Response: ApiEndpoint
```

#### 删除端点
```
POST /api-endpoints/{id}/delete

Response: { success: true; affectedCases: string[] }
```

#### 修改测试用例关联
```
POST /test-cases/{id}/link-endpoint
Body: { endpointId: string | null }

Response: TestCase
```

### 7.2 修改现有接口

#### 测试用例列表（返回增加 apiChangeFlag）
```
GET /test-cases?projectId={projectId}

Response: (TestCase & { apiChangeFlag?: {...} })[]
```

---

## 8. MVP 范围

### 做

- ✅ API 文档上传与解析（复用现有 parser）
- ✅ API 列表展示（按文档分组）
- ✅ API 详情查看
- ✅ API 编辑与删除
- ✅ 变更检测（复用现有 diff-service）
- ✅ 变更确认流程（Modal 确认）
- ✅ API ↔ 测试用例关联（endpointId）
- ✅ 测试用例"API 已变更"提醒

### 不做（后续迭代）

- ❌ API 版本历史与回滚
- ❌ API 标签管理
- ❌ 批量导出
- ❌ 高级搜索与过滤
- ❌ 变更通知推送

---

## 9. 开放问题

| # | 问题 | 状态 | 决策 |
|---|------|------|------|
| Q1 | 文档唯一标识如何确定？ | 待确认 | 建议使用 `name + format` 或用户手动选择 |
| Q2 | 删除 API 时关联用例如何处理？ | 待确认 | 建议保留用例，清空 endpointId，标记"API 已删除" |
| Q3 | 变更检测是否需要保留旧版本？ | 待确认 | MVP 不做版本历史，后续可加 |

---

## 10. 附录

### 现有代码复用

| 模块 | 文件 | 复用方式 |
|------|------|----------|
| API 解析 | `api-parser.ts` | 直接复用，不修改接口 |
| 变更检测 | `api-diff-service.ts` | 直接复用 |
| 数据模型 | `@nexqa/shared` | 扩展现有 schema |
| 存储服务 | `storage.ts` | 直接复用 |

### 参考文档

- 现有 spec: `openspec/specs/api-doc-import/spec.md`
- 现有 spec: `openspec/specs/test-case-generation/spec.md`
- 数据模型: `packages/shared/src/schemas/api-doc.ts`
