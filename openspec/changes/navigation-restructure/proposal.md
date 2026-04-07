## Why

当前导航结构存在严重的信息架构问题：项目被嵌套在「API 测试」模块下，但项目是全局概念（OpenClaw 等功能也属于项目）；用户进入系统先看到空洞的仪表盘而非直接选择项目；测试用例需要三层跳转（项目→文档→用例）才能到达；侧边栏与当前上下文无关。需要一次性重构为以项目为核心的导航体系。

## What Changes

- **BREAKING** 路由结构全面重构：`/api-tester/projects/$id/...` → `/p/$id/...`，路径深度从 6 级降到 3 级
- **BREAKING** 删除仪表盘页面（`/`），替换为项目选择页（无项目时引导创建，有项目时重定向到上次使用的项目）
- **BREAKING** 删除项目详情过渡页（`project-detail.tsx`），功能分散到各子页面
- 侧边栏重构为上下文感知：顶部项目切换下拉 + 根据当前项目动态渲染功能菜单（API 测试、OpenClaw、执行历史、项目设置）
- API 测试页面打平：合并文档列表、测试用例、测试结果为单页面，左侧筛选面板（按文档+标签），中间按接口聚合的用例列表，用例内联最新执行状态
- 新增独立执行历史页面，按批次查看历史结果
- 项目设置独立为子页面（baseURL、headers、OpenClaw 连接等从编辑弹窗移到专属页面）
- 全局设置（LLM、存储、外观）保持 `/settings` 路由

## Capabilities

### New Capabilities
- `project-context-navigation`: 项目切换器下拉、上下文感知侧边栏、项目选择首页、上次项目记忆
- `unified-test-view`: 打平的 API 测试视图（文档筛选+标签筛选+按接口聚合用例+内联执行状态）
- `execution-history`: 独立的测试执行历史页面，按批次查看

### Modified Capabilities
- `app-shell`: 侧边栏从固定菜单改为项目切换器+上下文功能菜单；删除仪表盘首页；路由前缀从 `/api-tester` 改为 `/p/$projectId`
- `project-management`: 项目设置独立为子页面；项目列表改为管理入口（从下拉进入）；删除项目详情过渡页
- `test-case-generation`: 用例视图从独立页面改为打平视图的一部分
- `test-execution`: 执行结果从独立页面改为用例内联状态+执行历史页

## Impact

- `packages/web/src/router.tsx` — 完全重写
- `packages/web/src/components/layout/sidebar.tsx` — 完全重写
- `packages/web/src/routes/` — 大部分文件重写或删除
- `packages/web/src/routes/dashboard.tsx` — 删除，替换为项目选择页
- `packages/web/src/routes/api-tester/project-detail.tsx` — 删除
- `packages/web/src/routes/api-tester/test-cases.tsx` — 重写为打平视图
- `packages/web/src/routes/api-tester/test-results.tsx` — 重写为执行历史
- 新增：项目选择页、项目设置页、项目切换器组件、执行历史页
- 后端无变更，API 不受影响
