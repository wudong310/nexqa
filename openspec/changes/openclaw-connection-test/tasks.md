## 1. 数据模型扩展

- [x] 1.1 在 `packages/shared/src/schemas/project.ts` 新增 `OpenClawConnectionSchema`、`OpenClawTimeoutSchema` 类型定义，`ProjectSchema` 新增可选的 `openclawConnections` 数组字段
- [x] 1.2 更新 `CreateProjectSchema` 和 `UpdateProjectSchema` 以包含 `openclawConnections`

## 2. 前端 WebSocket 测试模块

- [x] 2.1 创建 `packages/web/src/lib/openclaw-tester.ts`，定义 `OpenClawTestResult`、`TestStepResult` 类型
- [x] 2.2 实现 `connectWebSocket()` — 建立 WS 连接并等待 onopen，支持超时
- [x] 2.3 实现 `performHandshake()` — 等待 challenge 帧、发送 connect 请求、等待 connect 响应，支持超时
- [x] 2.4 实现 `sendTestMessage()` — 发送 chat.send、收集 delta 事件、等待 final 事件，支持超时，回复截断到 500 字符
- [x] 2.5 实现 `testConnection(config)` 主函数 — 串联三个阶段，前一步失败后续标记 skipped，最终关闭 WS

## 3. OpenClaw 连接管理页面

- [x] 3.1 创建 `packages/web/src/routes/api-tester/openclaw.tsx` 页面组件，包含连接列表展示和空状态提示
- [x] 3.2 实现添加连接弹窗 — 名称、网关地址、Token、测试消息输入，高级设置折叠区域（3 个超时配置）
- [x] 3.3 实现编辑连接弹窗 — 复用添加弹窗，回填已有数据
- [x] 3.4 实现删除连接 — 带确认弹窗
- [x] 3.5 实现测试连接按钮 — 调用 openclaw-tester，实时展示三阶段测试状态和结果

## 4. 路由和导航

- [x] 4.1 在 `packages/web/src/router.tsx` 新增 `/api-tester/projects/$projectId/openclaw` 路由
- [x] 4.2 在 `packages/web/src/routes/api-tester/project-detail.tsx` 新增 "OpenClaw 连接" 导航入口

## 5. 验证

- [x] 5.1 运行 `pnpm lint` 确认无错误
- [x] 5.2 运行 `pnpm build` 确认编译通过
