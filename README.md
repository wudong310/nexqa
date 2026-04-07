# NexQA

LLM 驱动的 HTTP API 测试工具，从非结构化文档自动生成测试用例。

## 功能

- **导入 API 文档** — 粘贴 Markdown、上传文件或输入 URL，LLM 自动提取 API 端点定义
- **AI 生成测试用例** — 基于确认后的 API 定义，自动生成覆盖正常/异常/边界的测试用例
- **执行 & 评估** — 单条或批量执行测试，自动判定 pass/fail，记录完整请求/响应
- **Monaco Editor** — 直接编辑测试用例 JSON，语法高亮 + 校验
- **历史记录** — 每次执行结果持久化保存，支持回溯查看
- **本地存储** — 所有数据以 JSON 文件存储在本地，无需数据库

## 前置要求

- Node.js >= 20
- pnpm >= 9
- 一个 LLM API Key（支持 OpenAI 兼容接口或 Anthropic）

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务（后端 :3456 + 前端 :5173）
pnpm dev
```

打开浏览器访问 http://localhost:5173

### 首次使用

1. 进入 **Settings** 页面，配置 LLM Provider：
   - 选择 `OpenAI Compatible` 或 `Anthropic`
   - 填入 API Key、Model（如 `deepseek-chat`、`claude-sonnet-4-20250514`）
   - 如使用 OpenAI 兼容接口，填入 Base URL（如 `https://api.deepseek.com/v1`）
2. 回到 **API Tester → Projects**，创建一个项目（填写名称和目标 API 的 Base URL）
3. 进入项目，点击 **Import Document**，粘贴 API 文档或输入 URL
4. LLM 解析完成后，确认提取的端点列表
5. 进入 **Test Cases**，点击 **Generate All** 生成测试用例
6. 选中用例可在右侧 Monaco Editor 中编辑，点击 **Execute** 执行
7. 进入 **Results** 页面可查看历史记录和详细的请求/响应

## 项目结构

```
packages/
├── shared/     # Zod schemas + TypeScript 类型（前后端共用）
├── server/     # Hono 后端（LLM 代理、API 测试执行、文件存储）
└── web/        # React 19 前端（shadcn/ui + TanStack Router）
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发环境（前后端并行） |
| `pnpm build` | 构建所有包 |
| `pnpm test` | 运行单元测试 |
| `pnpm lint` | 代码检查（Biome） |
| `pnpm lint:fix` | 自动修复 lint 问题 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19, Vite 6, shadcn/ui, TanStack Router/Query, Zustand, Monaco Editor |
| 后端 | Hono, Vercel AI SDK, Cheerio |
| 共享 | TypeScript 5, Zod |
| 工具 | pnpm workspace, Biome, Vitest |

## 数据存储

运行后数据保存在 `data/` 目录：

```
data/
├── settings.json          # LLM 配置 + 主题
├── projects/              # 项目
├── api-docs/              # 解析后的 API 文档
├── test-cases/            # 测试用例
└── test-results/          # 执行结果
```

## License

MIT
