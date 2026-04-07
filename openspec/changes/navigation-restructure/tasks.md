## 1. 路由重构

- [x] 1.1 重写 `router.tsx`：新路由结构（`/`, `/p/$projectId/api`, `/p/$projectId/api/import`, `/p/$projectId/history`, `/p/$projectId/openclaw`, `/p/$projectId/settings`, `/projects`, `/settings`）
- [x] 1.2 删除旧路由相关的导入和页面引用

## 2. 侧边栏与项目切换器

- [x] 2.1 创建 `components/layout/project-switcher.tsx`：Popover 下拉，展示项目列表、新建项目、管理项目入口
- [x] 2.2 重写 `components/layout/sidebar.tsx`：顶部项目切换器 + 上下文感知功能菜单（API 测试、执行历史、OpenClaw、项目设置、全局设置），无项目时只显示切换器和全局设置

## 3. 项目选择首页

- [x] 3.1 创建 `routes/project-select.tsx` 替代 `dashboard.tsx`：读取 localStorage `lastProjectId`，有效则重定向到 `/p/$id/api`，无效则展示项目选择卡片列表 + 创建项目按钮
- [x] 3.2 删除 `routes/dashboard.tsx`

## 4. 项目管理页

- [x] 4.1 将 `routes/api-tester/project-list.tsx` 重构为 `routes/projects.tsx`：路由从 `/api-tester/projects` 改为 `/projects`，保留项目列表、创建/编辑弹窗、删除功能

## 5. 项目设置页

- [x] 5.1 创建 `routes/project-settings.tsx`：展示项目名称、baseURL、共享请求头编辑表单，复用 OpenClaw 连接管理（从 openclaw.tsx 迁移连接 CRUD 部分，或在项目设置页内联展示）

## 6. 打平的 API 测试视图

- [x] 6.1 创建 `routes/api-test.tsx` 替代 `routes/api-tester/test-cases.tsx`：三栏布局（左侧筛选面板 + 中间用例列表 + 右侧详情面板）
- [x] 6.2 实现左侧筛选面板：文档多选（checkbox）+ 标签多选按钮 + 全部生成/全部执行按钮
- [x] 6.3 实现中间用例列表：跨文档加载所有用例，按 method+path 聚合分组，每条用例内联最新执行状态（✓/✗/未执行 + 状态码 + 耗时）
- [x] 6.4 实现右侧详情面板：选中用例时展示 Monaco JSON 编辑器 + 保存/执行按钮 + 最新执行结果
- [x] 6.5 全部生成：作用于筛选后的文档范围，调用已有 generate API
- [x] 6.6 全部执行：作用于筛选后的用例范围，顺序执行并实时更新内联状态

## 7. 执行历史页

- [x] 7.1 创建 `routes/execution-history.tsx`：加载项目所有 test-results，按执行时间分组为批次，展示批次摘要（时间戳、通过/失败数、通过率）
- [x] 7.2 实现批次展开详情：点击批次展开个体结果（用例名、接口、状态、耗时）
- [x] 7.3 实现结果详情弹窗或面板：点击个体结果查看完整请求和响应

## 8. 导入文档页迁移

- [x] 8.1 将 `routes/api-tester/import.tsx` 迁移为 `routes/api-import.tsx`，路由从 `/api-tester/projects/$projectId/import` 改为 `/p/$projectId/api/import`

## 9. OpenClaw 页迁移

- [x] 9.1 将 `routes/api-tester/openclaw.tsx` 迁移为 `routes/openclaw.tsx`，路由从 `/api-tester/projects/$projectId/openclaw` 改为 `/p/$projectId/openclaw`

## 10. 清理

- [x] 10.1 删除 `routes/api-tester/project-detail.tsx`
- [x] 10.2 删除 `routes/api-tester/test-results.tsx`（功能已分散到内联状态和执行历史）
- [x] 10.3 删除 `routes/api-tester/` 目录（如果已空）
- [x] 10.4 确保所有页面 `useParams` 的 `from` 路径匹配新路由

## 11. 验证

- [x] 11.1 运行 `pnpm lint` 确认无错误
- [x] 11.2 运行 `pnpm build` 确认编译通过
