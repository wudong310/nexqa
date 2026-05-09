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
  PlanGenV2Result,
  PlanGenV2Status,
  PlanGenerationV2,
  Project,
} from "@nexqa/shared";
import { createLogger } from "./logger.js";
import type { OpenClawBackendClient } from "./openclaw-client.js";
import { storage } from "./storage.js";

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
  /** 内存存储（后续可改为持久化） */
  private generations = new Map<string, PlanGenerationV2>();
  private openclawClient: OpenClawBackendClient;

  constructor(openclawClient: OpenClawBackendClient) {
    this.openclawClient = openclawClient;
  }

  /**
   * 启动方案生成
   *
   * 创建生成记录，启动异步任务，立即返回 id + status。
   */
  startGeneration(request: PlanGenV2Request): PlanGenerationV2 {
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
      startedAt: now,
      completedAt: null,
    };

    this.generations.set(id, generation);
    this.log.info(`方案生成已创建: id=${id}, projectId=${request.projectId}`);

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
  getGeneration(id: string): PlanGenerationV2 | null {
    return this.generations.get(id) ?? null;
  }

  /**
   * 内部：执行方案生成（fire-and-forget 模式）
   *
   * 重构后仅负责：
   * 1. 更新状态为 generating
   * 2. 验证项目存在性
   * 3. 构造 Agent 启动消息（含 projectId, generationId, intent, scope）
   * 4. 通过 OpenClaw 启动 Agent session（指定 nexqa SKILL）
   *
   * Agent 完成后通过 PUT /plan-generations-v2/:id/result 回写结果（不再等待）。
   *
   * 错误处理：
   * - spawn 失败 → 立即标记 generation 为 failed
   * - Agent 执行失败 → Agent 调用 PUT /error 路由
   * - session 超时 → OpenClaw Gateway 管理
   */
  private async executeGeneration(id: string): Promise<void> {
    const gen = this.generations.get(id);
    if (!gen) {
      this.log.error(`生成记录不存在: id=${id}`);
      return;
    }

    // 更新状态 → generating
    gen.status = "generating";
    this.log.info(`开始生成: id=${id}, intent="${gen.intent}"`);

    try {
      // 验证项目存在性
      const project = await storage.read<Project>("projects", gen.projectId);
      if (!project) {
        throw new Error(`项目不存在: ${gen.projectId}`);
      }

      // 构造 Agent 启动消息
      const taskMessage = this.buildAgentTaskMessage(gen, project);

      // 启动 Agent session（fire-and-forget）
      // Agent 完成后通过 PUT /plan-generations-v2/:id/result 回写
      await this.openclawClient.spawnSession({
        skill: "nexqa",
        message: taskMessage,
        meta: {
          generationId: id,
          projectId: gen.projectId,
        },
      });

      this.log.info(`Agent session 已启动: generationId=${id}`);
      // 注意：不再等待结果，Agent 异步回写
    } catch (err) {
      gen.status = "failed";
      gen.error = this.classifyError(err);
      gen.completedAt = new Date().toISOString();
      this.log.error(`Agent session 启动失败: id=${id}, error="${gen.error}"`);
    }
  }

  /**
   * 构造 Agent 启动消息
   *
   * 不再传入全量端点，仅传入任务上下文，Agent 自行查询。
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
    parts.push(
      "请按 SKILL.md 中的工作流执行。完成后通过 submit-plan.ts 回写结果。",
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
