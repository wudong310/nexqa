## Context

Nexlab 是一个全栈开发者工具箱，目前包含 API 测试功能。项目需要对接 OpenClaw AI Agent 网关，该网关使用 WebSocket JSON 帧协议通信，包含 challenge/connect 握手、chat.send 消息发送、流式 event 接收等环节。

当前项目数据模型（Project）只包含 REST API 测试相关的配置（baseURL、headers）。需要扩展以支持 OpenClaw 网关连接配置。

技术栈：前端 React + TanStack Router/Query + shadcn/ui，后端 Hono + 文件存储，共享类型 Zod schema。

## Goals / Non-Goals

**Goals:**
- 支持每个项目配置多个 OpenClaw 网关连接
- 提供可视化的三阶段连接测试（WS 连接 → 认证握手 → 消息收发）
- 独立子页面管理连接配置和测试
- 用户可自定义测试消息和超时参数

**Non-Goals:**
- 不做完整的 OpenClaw 聊天 UI（只做连接测试）
- 不做服务端 WebSocket 代理（前端直连 Gateway）
- 不做连接池或长连接管理
- 不处理网络环境问题（跨域、混合内容等后续遇到再处理）

## Decisions

### 1. 前端直连 vs 后端代理

**选择：前端直连**

浏览器原生 WebSocket API 直接连接 OpenClaw Gateway。服务端不参与 WebSocket 通信。

理由：
- 连接测试是一次性操作，不需要后端维护长连接
- 减少一跳延迟，测试耗时更真实
- 无需服务端引入 WebSocket 依赖
- Node v24.14 环境下浏览器原生 WebSocket 完全够用

替代方案：后端代理（token 更安全），但连接测试场景下 token 本身就需要用户输入到前端表单，安全性无差异。

### 2. 多连接配置 vs 单连接

**选择：多连接（数组）**

每个项目的 `openclawConnections` 是一个数组，支持配置多个网关（如生产/测试/灰度）。

理由：
- 用户可能需要同时测试多个环境的网关
- 数组结构向前兼容，后续可扩展为连接选择器

### 3. 测试 Session Key

**选择：固定 userId = `nexlab-test`**

Session Key 格式为 `agent:main:webchat:default:dm:nexlab-test`，所有测试共用同一个固定用户标识。

理由：
- 避免产生大量临时 session 垃圾数据
- 测试目的是验证链路，不需要用户隔离
- 简化配置，用户不需要关心 sessionKey 细节

### 4. WS 测试逻辑封装

**选择：独立模块 `openclaw-tester.ts`**

将 WebSocket 测试流程封装为纯函数模块，返回 Promise<TestResult>。与 UI 组件解耦。

```
openclaw-tester.ts
├── testConnection(config) → Promise<OpenClawTestResult>
│   ├── Step 1: connectWebSocket()
│   ├── Step 2: performHandshake()
│   └── Step 3: sendTestMessage()
└── 每步返回 { status, duration, error?, detail? }
```

### 5. 页面结构

**选择：独立子页面 + 弹窗编辑**

路由 `/api-tester/projects/$projectId/openclaw`，连接列表直接展示，添加/编辑使用 Dialog 弹窗。

超时配置在弹窗中作为「高级设置」折叠区域，默认收起。

## Risks / Trade-offs

- **[浏览器网络限制]** → 如果 Nexlab 通过 HTTPS 访问但 Gateway 是 ws://，浏览器会阻止混合内容。暂不处理，遇到时可引导用户使用 wss:// 或 HTTP 模式访问 Nexlab。

- **[Token 前端暴露]** → Token 存在后端文件中，但前端需要读取并用于 WebSocket 连接。可接受，因为 Nexlab 是内部工具，且测试流程本身需要 token。

- **[Gateway 协议变化]** → 当前实现硬编码 protocol version 3 和固定的 connect 参数。如果 Gateway 升级协议，需要更新前端代码。mitigation: 将协议参数提取为常量。

- **[大量 delta 事件]** → AI 回复可能很长，产生大量 delta 事件。mitigation: 测试完成后立即关闭 WebSocket，前端只展示回复的前 500 字符。
