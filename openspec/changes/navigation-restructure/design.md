## Context

Nexlab 当前使用固定三项侧边栏（仪表盘、API 测试、设置），项目藏在 API 测试下级，路由路径深达 6 级。用户需要多次跳转才能到达核心功能。OpenClaw 等新功能的加入使得项目应该作为全局上下文而非某个模块的子页面。

技术栈：React + TanStack Router/Query + shadcn/ui + Hono 后端。所有数据通过 REST API 存取，后端无状态。

## Goals / Non-Goals

**Goals:**
- 项目作为全局上下文，侧边栏顶部下拉切换
- 侧边栏根据当前项目动态渲染功能菜单
- API 测试视图打平为单页面（文档筛选+标签筛选+按接口聚合用例+内联执行状态）
- 进系统直接选项目或自动进入上次项目
- 路由简洁化：`/p/$id/...`

**Non-Goals:**
- 后端 API 不做任何变更（纯前端重构）
- 不改变数据存储结构
- 不做项目权限/多用户

## Decisions

### 1. 路由结构

```
/                          → 项目选择页（无项目→创建引导；有上次项目→重定向）
/p/$projectId/api          → API 测试（打平视图）
/p/$projectId/api/import   → 导入文档
/p/$projectId/history      → 执行历史
/p/$projectId/openclaw     → OpenClaw 连接测试
/p/$projectId/settings     → 项目设置
/projects                  → 项目管理（从下拉「管理项目」进入）
/settings                  → 全局设置
```

理由：`/p/` 前缀简短；项目 ID 在第二级，所有功能页面是第三级，最深不超过 4 级。

### 2. 项目上下文管理

使用 localStorage 存储 `lastProjectId`。首页（`/`）读取此值：
- 有值且项目存在 → 重定向到 `/p/$id/api`
- 无值或项目不存在 → 展示项目选择页

侧边栏项目切换器切换时更新 localStorage 并导航到新项目的 `/p/$newId/api`。

替代方案：URL query param 或 React Context。选择 localStorage 因为最简单且跨刷新持久。

### 3. 侧边栏结构

```
┌──────────────────┐
│  Nexlab           │
│ ┌──────────────┐ │
│ │▼ 项目名称    │ │  ← ProjectSwitcher 组件
│ └──────────────┘ │
├──────────────────┤
│  📄 API 测试    │  ← /p/$id/api
│  📊 执行历史    │  ← /p/$id/history
│  🔌 OpenClaw   │  ← /p/$id/openclaw
├──────────────────┤
│  ⚙ 项目设置    │  ← /p/$id/settings
│  ⚙ 全局设置    │  ← /settings
└──────────────────┘
```

ProjectSwitcher 是一个 Popover 组件，展示项目列表+新建+管理入口。

### 4. 打平的 API 测试页面

单页面三栏布局：

```
┌────────────┬──────────────────────────┬──────────────────┐
│  筛选面板   │  用例列表（按接口聚合）   │  详情面板         │
│  - 文档复选 │  GET /users              │  Monaco Editor   │
│  - 标签复选 │    ├ 正常获取 ✓200 1.2s  │  或执行结果       │
│  - 全部生成 │    └ 缺少鉴权 ✓401 0.3s  │                  │
│  - 全部执行 │  POST /users             │                  │
│            │    ├ 创建用户 ● 未执行    │                  │
└────────────┴──────────────────────────┴──────────────────┘
```

- 左侧筛选面板：文档多选（checkbox）+ 标签多选 + 操作按钮
- 中间列表：跨文档的所有用例，按 method+path 聚合，内联最新执行状态
- 右侧详情：选中用例时展示 JSON 编辑器 + 执行按钮 + 结果

数据获取：查询当前项目所有文档的用例（`/test-cases?projectId=xxx`，需要在前端根据 apiDocId 关联文档筛选）。

### 5. 文件增删规划

新增文件：
- `components/layout/project-switcher.tsx`
- `routes/project-select.tsx`（首页/项目选择）
- `routes/project-settings.tsx`
- `routes/execution-history.tsx`

重写文件：
- `router.tsx`
- `components/layout/sidebar.tsx`
- `routes/api-tester/test-cases.tsx` → `routes/api-test.tsx`
- `routes/api-tester/import.tsx` → `routes/api-import.tsx`
- `routes/api-tester/test-results.tsx` → `routes/execution-history.tsx`
- `routes/api-tester/openclaw.tsx` → `routes/openclaw.tsx`

删除文件：
- `routes/dashboard.tsx`
- `routes/api-tester/project-list.tsx`（逻辑移入 project-switcher + project-select）
- `routes/api-tester/project-detail.tsx`

## Risks / Trade-offs

- **[大范围重构]** → 几乎所有前端路由和页面都会变更，回归风险高。mitigation: 后端 API 完全不变，只要前端编译通过即可验证。

- **[打平视图性能]** → 大量用例跨文档聚合可能导致渲染慢。mitigation: 使用 useMemo 聚合，列表使用虚拟化（如果需要）。

- **[localStorage 项目记忆]** → 清理浏览器数据会丢失。可接受，只是便捷性功能，丢失后回到项目选择页。
