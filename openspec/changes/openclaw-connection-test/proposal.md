## Why

项目需要对接 OpenClaw AI Agent 网关，目前没有任何方式验证网关连通性和 Agent 可用性。开发和运维人员需要一个可视化的连接测试工具，能够验证从 WebSocket 连接、认证握手到完整对话收发的全链路可用性。

## What Changes

- 项目数据模型新增 `openclawConnections` 可选字段，支持每个项目配置多个 OpenClaw 网关连接
- 新增独立页面 `/projects/$projectId/openclaw`，管理连接配置（增删改）和执行连接测试
- 前端实现 WebSocket 直连 OpenClaw Gateway 的三阶段测试逻辑（连接 → 握手 → 对话）
- 连接编辑使用弹窗交互，支持配置网关地址、Token、测试消息、超时参数
- 项目详情页新增 OpenClaw 连接管理入口

## Capabilities

### New Capabilities
- `openclaw-connection`: OpenClaw 网关连接配置管理与全链路连接测试

### Modified Capabilities
- `project-management`: 项目数据模型扩展 openclawConnections 字段

## Impact

- `packages/shared/src/schemas/project.ts` — 新增 OpenClawConnection 类型定义
- `packages/web/src/router.tsx` — 新增路由
- `packages/web/src/routes/api-tester/` — 新增 openclaw.tsx 页面
- `packages/web/src/lib/` — 新增 openclaw-tester.ts 前端 WS 测试逻辑
- `packages/web/src/routes/api-tester/project-detail.tsx` — 新增入口按钮
- 无后端新增路由，复用现有 Project CRUD
- 无新依赖，浏览器原生 WebSocket API
