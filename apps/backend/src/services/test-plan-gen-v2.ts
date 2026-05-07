/**
 * test-plan-gen-v2 — 基于 OpenClaw Agent 的测试方案生成服务
 *
 * 与 V1（plan-generator.ts）的区别：
 * - V1：本地 LLM 直调 + 规则引擎降级
 * - V2：通过 OpenClaw Agent 调用，Agent 有完整上下文理解能力
 *
 * 状态机：pending → generating → completed / failed
 */

import { randomUUID } from "node:crypto";
import type {
  PlanGenerationV2,
  PlanGenV2Result,
  PlanGenV2Status,
} from "@nexqa/shared";
import { PlanGenV2ResultSchema } from "@nexqa/shared";
import { createLogger } from "./logger.js";
import type { OpenClawBackendClient } from "./openclaw-client.js";

// Re-export types for consumers
export type { PlanGenerationV2, PlanGenV2Result, PlanGenV2Status };

// ─── Constants ────────────────────────────────────────────────────────────────

const TIMEOUTS = {
  /** 测试方案生成最长等待 30s */
  planGeneration: 30_000,
} as const;

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
   * 内部：执行方案生成
   *
   * 1. 更新状态为 generating
   * 2. 调用 openclaw-client.sendAndWait 发送 prompt
   * 3. 解析返回的 JSON 结果
   * 4. Zod 校验 + 状态更新
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
      // 构建 prompt
      const prompt = this.buildPrompt(gen);

      // 调用 OpenClaw Agent
      const rawResponse = await this.openclawClient.sendAndWait(prompt, {
        timeout: TIMEOUTS.planGeneration,
      });

      // 解析 JSON
      const parsed = this.parseAgentResponse(rawResponse);

      // Zod 校验
      const validated = PlanGenV2ResultSchema.parse(parsed);

      // 完成
      gen.status = "completed";
      gen.result = validated;
      gen.completedAt = new Date().toISOString();
      this.log.info(
        `方案生成完成: id=${id}, plan="${validated.plan.name}"`,
      );
    } catch (err) {
      // 失败处理
      gen.status = "failed";
      gen.error = this.classifyError(err);
      gen.completedAt = new Date().toISOString();
      this.log.error(`方案生成失败: id=${id}, error="${gen.error}"`);
    }
  }

  /**
   * 构建发送给 OpenClaw Agent 的 prompt
   */
  private buildPrompt(gen: PlanGenerationV2): string {
    const scopeSection = gen.scope
      ? this.buildScopeSection(gen.scope)
      : "范围: 全量";

    return [
      "你是一个测试架构师。请根据以下信息生成最优测试方案。",
      "",
      "## 项目信息",
      `- 项目 ID: ${gen.projectId}`,
      `- ${scopeSection}`,
      "",
      "## 用户意图",
      gen.intent,
      "",
      "## 输出要求",
      "请严格按以下 JSON 格式输出：",
      "```json",
      "{",
      '  "parsedIntent": {',
      '    "type": "release|smoke|regression|security|full|module|quick|custom",',
      '    "scope": "all|changed|specific",',
      '    "urgency": "normal|quick"',
      "  },",
      '  "plan": {',
      '    "name": "方案名称",',
      '    "description": "方案描述",',
      '    "stages": [',
      "      {",
      '        "name": "阶段名",',
      '        "order": 1,',
      '        "selection": { "tags": {...}, "endpointIds": [...] },',
      '        "criteria": { "minPassRate": 0.95, "maxP0Fails": 0, "maxP1Fails": 3 },',
      '        "gate": true',
      "      }",
      "    ],",
      '    "execution": {',
      '      "concurrency": 3,',
      '      "retryOnFail": 1,',
      '      "timeoutMs": 30000,',
      '      "stopOnGateFail": true',
      "    },",
      '    "criteria": { "minPassRate": 0.95, "maxP0Fails": 0, "maxP1Fails": 3 },',
      '    "reasoning": "分析推理过程..."',
      "  }",
      "}",
      "```",
    ].join("\n");
  }

  /**
   * 构建范围描述
   */
  private buildScopeSection(
    scope: NonNullable<PlanGenerationV2["scope"]>,
  ): string {
    const parts: string[] = [];
    if (scope.gitSourceIds?.length) {
      parts.push(`Git 来源: ${scope.gitSourceIds.join(", ")}`);
    }
    if (scope.endpointIds?.length) {
      parts.push(`限定端点: ${scope.endpointIds.length} 个`);
    }
    if (scope.changedOnly) {
      parts.push("仅覆盖变更端点");
    }
    return parts.length > 0 ? `范围: ${parts.join(" | ")}` : "范围: 全量";
  }

  /**
   * 解析 Agent 返回的文本为 JSON
   *
   * 处理策略（参照 §6.4）：
   * 1. 直接 JSON.parse
   * 2. 提取 ```json 代码块后 parse
   * 3. 都失败则抛出格式错误
   */
  private parseAgentResponse(raw: string): unknown {
    const trimmed = raw.trim();

    // 尝试直接解析
    try {
      return JSON.parse(trimmed);
    } catch {
      // 继续尝试代码块提取
    }

    // 尝试提取 ```json ... ``` 代码块
    const jsonBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;
    const match = trimmed.match(jsonBlockRegex);
    if (match?.[1]) {
      try {
        return JSON.parse(match[1].trim());
      } catch {
        throw new Error(
          `Agent 返回的 JSON 代码块解析失败: ${match[1].slice(0, 100)}...`,
        );
      }
    }

    throw new Error(
      `Agent 返回非 JSON 格式: ${trimmed.slice(0, 200)}...`,
    );
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
      return `生成超时 (${TIMEOUTS.planGeneration}ms): ${msg}`;
    }

    // 连接失败
    if (
      msg.includes("连接") ||
      msg.includes("WebSocket") ||
      msg.includes("connect")
    ) {
      return `OpenClaw 连接失败: ${msg}`;
    }

    // Zod 校验失败
    if (err.name === "ZodError") {
      return `Agent 返回格式校验失败: ${msg}`;
    }

    // JSON 解析失败
    if (msg.includes("JSON") || msg.includes("解析")) {
      return `Agent 返回格式错误: ${msg}`;
    }

    return `生成失败: ${msg}`;
  }
}
