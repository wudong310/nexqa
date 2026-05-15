/**
 * test-plan-gen-v2 — 基于 OpenClaw Agent 的测试方案生成服务
 *
 * V2 重构后：
 * - 从"同步 prompt 模式"改为"异步 session 模式"
 * - service 仅负责"触发 session"，不再做数据查询/prompt 构建/结果解析
 * - Agent 通过 PUT 路由异步回写结果
 *
 * 状态机：pending → generating → completed / failed
 *   - pending → generating: executeGeneration 启动时
 *   - generating → completed: Agent 通过 PUT /result 回写
 *   - generating → failed: Agent 通过 PUT /error 上报 或 spawn 失败
 */

import { randomUUID } from "node:crypto";
import type {
  LogEntry,
  PlanGenV2Result,
  PlanGenV2Status,
  PlanGenerationV2,
  Project,
} from "@nexqa/shared";
import { PlanGenV2ResultSchema } from "@nexqa/shared";
import { createLogger } from "./logger.js";
import type {
  OpenClawBackendClient,
  SessionEvent,
} from "./openclaw-client.js";
import { storage } from "./storage.js";

export interface EventBroadcaster {
  broadcast: (event: unknown) => void;
}

// Re-export types for consumers
export type { PlanGenerationV2, PlanGenV2Result, PlanGenV2Status };

// ─── Types ────────────────────────────────────────────────────────────────────

/** 生成请求参数 */
export interface PlanGenV2Request {
  /** 项目 ID */
  projectId: string;
  /** 用户意图（自然语言） */
  intent: string;
  /** 范围限定（可选） */
  scope?: {
    gitSourceIds?: string[];
    endpointIds?: string[];
    changedOnly?: boolean;
  };
  /** OpenClaw 连接 ID（引用 Project.openclawConnections[].id） */
  openclawConnectionId: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class TestPlanGenV2Service {
  private log = createLogger("test-plan-gen-v2");
  private openclawClient: OpenClawBackendClient;
  private eventBroadcaster?: EventBroadcaster;

  constructor(
    openclawClient: OpenClawBackendClient,
    eventBroadcaster?: EventBroadcaster,
  ) {
    this.openclawClient = openclawClient;
    this.eventBroadcaster = eventBroadcaster;
  }

  /**
   * Bug 11 修复：更新 broadcaster（用于 serviceCache 场景）
   */
  updateBroadcaster(broadcaster: EventBroadcaster): void {
    this.eventBroadcaster = broadcaster;
  }

  /**
   * 启动方案生成
   *
   * 创建生成记录，启动异步任务，立即返回 id + status。
   */
  async startGeneration(request: PlanGenV2Request): Promise<PlanGenerationV2> {
    // 输入校验
    if (!request.projectId) {
      throw new Error("projectId 不能为空");
    }
    if (!request.intent || request.intent.trim().length === 0) {
      throw new Error("intent 不能为空");
    }
    if (!request.openclawConnectionId) {
      throw new Error("openclawConnectionId 不能为空");
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    const generation: PlanGenerationV2 = {
      id,
      projectId: request.projectId,
      status: "pending",
      intent: request.intent,
      scope: request.scope,
      openclawConnectionId: request.openclawConnectionId,
      result: null,
      error: null,
      logs: [],
      startedAt: now,
      completedAt: null,
    };

    // 持久化到 storage
    await storage.write<PlanGenerationV2>("plan-generations-v2", id, generation);
    this.log.info(
      `方案生成已创建: id=${id}, projectId=${request.projectId}`,
    );

    // 启动异步执行（不阻塞）
    this.executeGeneration(id).catch((err) => {
      this.log.error(
        `方案生成异步执行异常: id=${id}`,
        err instanceof Error ? err.message : String(err),
      );
    });

    return generation;
  }

  /**
   * 查询生成状态和结果
   */
  async getGeneration(id: string): Promise<PlanGenerationV2 | null> {
    return storage.read<PlanGenerationV2>("plan-generations-v2", id);
  }

  /**
   * 内部：执行方案生成（异步 session 模式）
   *
   * 流程：
   * 1. 从 storage 读取并更新状态为 generating
   * 2. 验证项目存在性
   * 3. 订阅 session 事件流（用于流式推送）
   * 4. 创建 session 并指定 agentId
   * 5. 等待完成（通过事件回调检测终态）
   * 6. 取消订阅并断开连接
   */
  private async executeGeneration(id: string): Promise<void> {
    const gen = await storage.read<PlanGenerationV2>(
      "plan-generations-v2",
      id,
    );
    if (!gen) {
      this.log.error(`生成记录不存在: id=${id}`);
      return;
    }

    // 更新状态 → generating
    gen.status = "generating";
    await storage.write("plan-generations-v2", id, gen);
    this.log.info(`开始生成: id=${id}, intent="${gen.intent}"`);

    let unsubscribe: (() => void) | null = null;

    try {
      // 验证项目存在性
      const project = await storage.read<Project>("projects", gen.projectId);
      if (!project) {
        throw new Error(`项目不存在: ${gen.projectId}`);
      }

      // 构造 Agent 消息
      const taskMessage = this.buildAgentTaskMessage(gen, project);
      const sessionKey = `plan-gen-${gen.id}`;

      // 连接 Gateway
      await this.openclawClient.connect();

      // Bug 6 修复：先订阅，等确认后再创建 session
      // 订阅 session 事件（流式推送）
      unsubscribe = await this.openclawClient.subscribeToSession({
        key: sessionKey,
        onEvent: (event) => {
          this.handleAgentEvent(id, event);
        },
      });

      // Bug 6 修复：订阅确认后增加 100ms delay，确保事件处理器已就绪
      await new Promise((r) => setTimeout(r, 100));

      // 创建 session 并指定 agentId
      const { sessionId } = await this.openclawClient.createSession({
        agentId: "nexqa", // 使用已注册的 nexqa agent
        key: sessionKey,
        initialMessage: taskMessage, // 创建时直接发消息
      });

      this.log.info(
        `Session 已创建: sessionId=${sessionId}, agentId=nexqa`,
      );

      // Bug 修复：不再阻塞等待完成，Agent 会通过 PUT /result 或 PUT /error 回写状态
      // 设置 30 分钟后自动清理（断开连接）
      setTimeout(
        () => {
          this.cleanupSession(id, unsubscribe);
        },
        30 * 60 * 1000,
      );
    } catch (err) {
      gen.status = "failed";
      gen.error = this.classifyError(err);
      gen.completedAt = new Date().toISOString();
      await storage.write("plan-generations-v2", id, gen);

      this.log.error(
        `方案生成失败: id=${id}, error="${gen.error}"`,
      );
    }
  }

  /**
   * 清理 session（取消订阅 + 断开连接）
   */
  private async cleanupSession(
    generationId: string,
    unsubscribe: (() => void) | null,
  ): Promise<void> {
    const gen = await storage.read<PlanGenerationV2>(
      "plan-generations-v2",
      generationId,
    );

    // 如果还在 generating 状态，标记为 failed
    if (gen && gen.status === "generating") {
      gen.status = "failed";
      gen.error = "生成超时（30分钟）";
      gen.completedAt = new Date().toISOString();
      await storage.write("plan-generations-v2", generationId, gen);
      this.log.warn(`Session 超时清理: generationId=${generationId}`);
    }

    // 取消订阅
    if (unsubscribe) {
      unsubscribe();
    }
    // 断开连接
    try {
      this.openclawClient.disconnect();
    } catch {
      // ignore
    }
  }

  /**
   * 构造 Agent 消息
   *
   * Bug 7/9 修复：明确指示 Agent 只通过 submit-plan.ts 提交结果
   */
  private buildAgentTaskMessage(
    gen: PlanGenerationV2,
    project: Project,
  ): string {
    const parts: string[] = [
      `## 测试方案生成任务`,
      ``,
      `- 项目ID: ${gen.projectId}`,
      `- 项目名称: ${project.name}`,
      `- 生成记录ID: ${gen.id}`,
      `- NexQA API: ${this.getNexqaApiUrl(project)}`,
      `- 用户意图: "${gen.intent}"`,
    ];

    if (gen.scope) {
      parts.push(`- 范围限定:`);
      if (gen.scope.changedOnly) parts.push(`  - 仅变更端点`);
      if (gen.scope.gitSourceIds?.length)
        parts.push(`  - Git Sources: ${gen.scope.gitSourceIds.join(", ")}`);
      if (gen.scope.endpointIds?.length)
        parts.push(`  - 指定端点: ${gen.scope.endpointIds.join(", ")}`);
    }

    parts.push("");
    parts.push(`## SKILL 使用指引`);
    parts.push(
      `使用 \`npx tsx ~/Studio/skills/tools/nexqa/scripts/\` 下的脚本按需查询：`,
    );
    parts.push(
      `- \`list-endpoints.ts\` — 查询项目端点列表（--project-id ${gen.projectId}）`,
    );
    parts.push(
      `- \`list-tests.ts\` — 查询项目测试用例（--project-id ${gen.projectId}）`,
    );
    parts.push(
      `- \`get-endpoint.ts\` — 查询单个端点详情（--endpoint-id <id>）`,
    );
    parts.push(
      `- \`submit-plan.ts\` — 提交生成的测试方案（--generation-id ${gen.id} --plan '<json>'）`,
    );

    parts.push("");
    parts.push(`## 结果提交方式`);
    parts.push(
      `**重要：完成推理后，必须通过 submit-plan.ts 脚本提交结果，不要直接返回 JSON。**`,
    );
    parts.push(
      `示例：echo '<PlanGenV2Result JSON>' | npx tsx ~/Studio/skills/tools/nexqa/scripts/submit-plan.ts --base-url ${this.getNexqaApiUrl(project)} --generation-id ${gen.id}`,
    );
    parts.push(
      `提交成功后，消息最后只需返回一句“方案已提交”即可。`,
    );

    return parts.join("\n");
  }

  /**
   * 获取 NexQA API 地址（供脚本的 --base-url 参数使用）
   *
   * 优先使用 project.baseURL，其次回退到默认本地地址。
   */
  private getNexqaApiUrl(project: Project): string {
    // Project 类型中 baseURL 可能不存在于类型定义，安全访问
    const baseUrl = (project as Record<string, unknown>).baseURL as
      | string
      | undefined;
    return baseUrl || process.env.NEXQA_API_URL || "http://localhost:4700";
  }

  /**
   * 处理 Agent 事件：转发给前端 + 持久化日志 + 处理终态
   *
   * Bug 3 修复：广播字段名对齐前端期望
   * 前端 usePlanGenV2WS.ts 期望: data.text, data.toolName, data.toolInput, data.result
   */
  private handleAgentEvent(generationId: string, event: SessionEvent): void {
    // 提取文本和工具调用信息
    const text = this.extractText(event.message);
    const toolCalls = event.toolCalls as
      | Array<{ name?: string; input?: unknown; result?: unknown }>
      | undefined;

    // 从 toolCalls 中提取第一个调用的信息（如果有）
    let toolName: string | undefined;
    let toolInput: Record<string, unknown> | undefined;
    let toolResult: unknown;

    if (toolCalls && toolCalls.length > 0) {
      const firstCall = toolCalls[0];
      toolName = firstCall.name;
      toolInput =
        firstCall.input && typeof firstCall.input === "object"
          ? (firstCall.input as Record<string, unknown>)
          : undefined;
      toolResult = firstCall.result;
    }

    // 日志条目（用于持久化）
    const logEntry: LogEntry = {
      event: event.state as string,
      text,
      timestamp: new Date().toISOString(),
    };

    // 异步持久化日志
    this.persistLog(generationId, logEntry).catch((err) => {
      this.log.error(`日志持久化失败: generationId=${generationId}`, err);
    });

    // 转发到前端 WS（字段名对齐前端期望）
    this.eventBroadcaster?.broadcast({
      type: "plan-gen-v2:event",
      payload: {
        generationId,
        event: event.state as
          | "delta"
          | "tool_use"
          | "tool_result"
          | "final"
          | "error",
        data: {
          text,
          toolName,
          toolInput,
          result: toolResult,
        },
        timestamp: logEntry.timestamp,
      },
    });

    // 终态处理：仅记录日志，不再从消息中解析 JSON
    // Bug 7/9 修复：结果统一由 submit-plan.ts 通过 PUT 路由回写
    if (event.state === "final") {
      this.log.info(
        `Agent final 事件: generationId=${generationId}, text.length=${text.length}`,
      );
      return;
    }
    if (event.state === "error") {
      void this.persistError(generationId, event);
    }
  }

  /**
   * 持久化日志条目
   */
  private async persistLog(
    generationId: string,
    logEntry: LogEntry,
  ): Promise<void> {
    const gen = await storage.read<PlanGenerationV2>(
      "plan-generations-v2",
      generationId,
    );
    if (!gen) return;

    // 追加日志
    if (!gen.logs) {
      gen.logs = [];
    }
    gen.logs.push(logEntry);

    // 写回 storage
    await storage.write("plan-generations-v2", generationId, gen);
  }

  /**
   * Bug 7/9 修复：删除 persistFinal，结果统一由 submit-plan.ts 通过 PUT 路由回写
   * 保留此注释以说明历史原因
   */

  private async persistError(
    generationId: string,
    event: SessionEvent,
  ): Promise<void> {
    const gen = await storage.read<PlanGenerationV2>(
      "plan-generations-v2",
      generationId,
    );
    if (!gen) return;
    gen.status = "failed";
    gen.error = `Agent 错误: ${this.extractText(event.message) || "未知错误"}`;
    gen.completedAt = new Date().toISOString();
    await storage.write("plan-generations-v2", generationId, gen);
  }

  private extractText(message: unknown): string {
    if (!message || typeof message !== "object") return "";
    const m = message as Record<string, unknown>;
    if (Array.isArray(m.content)) {
      return (m.content as Array<Record<string, unknown>>)
        .filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text as string)
        .join("");
    }
    if (typeof m.text === "string") return m.text;
    if (typeof m.content === "string") return m.content;
    return "";
  }

  /**
   * 错误分类 — 对外暴露有意义的错误消息
   */
  private classifyError(err: unknown): string {
    if (!(err instanceof Error)) {
      return `未知错误: ${String(err)}`;
    }

    const msg = err.message;

    // 超时
    if (msg.includes("超时") || msg.includes("timeout")) {
      return `spawn session 超时: ${msg}`;
    }

    // 连接失败
    if (
      msg.includes("连接") ||
      msg.includes("WebSocket") ||
      msg.includes("connect")
    ) {
      return `OpenClaw 连接失败: ${msg}`;
    }

    return `生成失败: ${msg}`;
  }
}

// ─── 辅助函数 ────────────────────────────────────────────────────────────────────

/**
 * 从 Agent 返回文本中提取 JSON
 *
 * 尝试直接解析，失败则用正则提取 ```json ... ``` 或 { ... } 块。
 */
export function extractJson(text: string): unknown {
  // 尝试 1：直接解析为 JSON
  try {
    const parsed = JSON.parse(text.trim());
    return parsed;
  } catch {
    // 继续尝试
  }

  // 尝试 2：提取 markdown 代码块中的 JSON
  const codeBlockMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      return parsed;
    } catch {
      // 继续尝试
    }
  }

  // 尝试 3：找到第一个 { 和最后一个 } 之间的内容
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const jsonStr = text.slice(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonStr);
      return parsed;
    } catch {
      // 解析失败
    }
  }

  throw new Error("无法从返回文本中提取有效 JSON");
}
