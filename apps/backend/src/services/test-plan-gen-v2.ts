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
  ApiEndpoint,
  PlanGenerationV2,
  PlanGenV2Result,
  PlanGenV2Status,
  Project,
  ScanRecord,
} from "@nexqa/shared";
import { PlanGenV2ResultSchema } from "@nexqa/shared";
import {
  buildPlanGenV2Prompt,
  type PlanGenV2ApiChanges,
  type PlanGenV2Endpoint,
  type PlanGenV2ProjectContext,
} from "../prompts/plan-gen-v2.js";
import { createLogger } from "./logger.js";
import type { OpenClawBackendClient } from "./openclaw-client.js";
import { storage } from "./storage.js";

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
   * 2. 查询项目上下文、API 端点、变更数据
   * 3. 根据 scope 条件（changedOnly / endpointIds）过滤端点并注入变更
   * 4. 调用 buildPlanGenV2Prompt 构建结构化 prompt
   * 5. 调用 openclaw-client.sendAndWait 发送 prompt
   * 6. 解析返回的 JSON 结果 + Zod 校验 + 状态更新
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
      // ── 1. 查询项目上下文 ────────────────────────────────────────
      const project = await storage.read<Project>("projects", gen.projectId);
      if (!project) {
        throw new Error(`项目不存在: ${gen.projectId}`);
      }

      // ── 2. 查询该项目下所有 API 端点 ────────────────────────────
      const allEndpoints = await storage.list<ApiEndpoint>("api-endpoints");
      const projectEndpoints = allEndpoints.filter(
        (ep) => ep.projectId === gen.projectId,
      );

      // ── 3. 查询该项目下现有用例总数（用于项目上下文） ────────────
      const allCases = await storage.list<{ id: string; projectId: string }>("test-cases");
      const totalCases = allCases.filter((tc) => tc.projectId === gen.projectId).length;

      // ── 4. 根据 scope 条件构建端点列表和变更数据 ────────────────
      let endpointList: PlanGenV2Endpoint[];
      let apiChanges: PlanGenV2ApiChanges | undefined;

      if (gen.scope?.changedOnly && gen.scope.gitSourceIds?.length) {
        // changedOnly 模式：查询最新扫描变更，注入 apiChanges
        const changesResult = await this.getLatestChanges(gen.scope.gitSourceIds);
        apiChanges = changesResult.apiChanges;
        endpointList = changesResult.affectedEndpoints.length > 0
          ? this.toPromptEndpoints(changesResult.affectedEndpoints)
          : this.toPromptEndpoints(projectEndpoints); // 无变更时降级为全量

        if (apiChanges && (apiChanges.added.length + apiChanges.updated.length + apiChanges.removed.length) > 0) {
          this.log.info(
            `变更注入: added=${apiChanges.added.length} updated=${apiChanges.updated.length} removed=${apiChanges.removed.length}`,
          );
        } else {
          this.log.info("changedOnly 模式但无变更数据，降级为全量端点分析");
          apiChanges = undefined;
        }
      } else if (gen.scope?.endpointIds?.length) {
        // 指定端点模式：仅传递指定端点
        const specifiedIds = new Set(gen.scope.endpointIds);
        const filtered = projectEndpoints.filter((ep) => specifiedIds.has(ep.id));
        endpointList = filtered.length > 0
          ? this.toPromptEndpoints(filtered)
          : this.toPromptEndpoints(projectEndpoints); // 指定的端点未找到时降级为全量

        if (filtered.length > 0) {
          this.log.info(`指定端点过滤: ${filtered.length}/${gen.scope.endpointIds.length} 命中`);
        } else {
          this.log.info("指定端点均未找到，降级为全量端点分析");
        }
      } else {
        // 默认：全量端点分析
        endpointList = this.toPromptEndpoints(projectEndpoints);
        this.log.info(`全量端点分析: ${endpointList.length} 个端点`);
      }

      // ── 5. 构建项目上下文 ───────────────────────────────────────
      const projectContext: PlanGenV2ProjectContext = {
        name: project.name,
        totalCases,
        tagDistribution: "（自动分析）", // TODO: 后续从用例标签统计生成
      };

      // ── 6. 使用 prompt 模板构建结构化 prompt ────────────────────
      const prompt = buildPlanGenV2Prompt({
        projectContext,
        endpointList,
        apiChanges,
        userIntent: gen.intent,
      });

      // ── 7. 调用 OpenClaw Agent ─────────────────────────────────
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

  // ── 变更数据查询 ─────────────────────────────────────────────────────────

  /**
   * 查询 gitSourceIds 关联的最新扫描变更
   *
   * 逻辑：
   * 1. 获取所有 ScanRecord，按 gitSourceId 筛选
   * 2. 取每个 gitSourceId 最新的 completed 记录
   * 3. 汇总 diff 结果（added/updated/removed）转为 PlanGenV2ApiChanges
   * 4. 收集受影响的端点用于过滤
   */
  private async getLatestChanges(gitSourceIds: string[]): Promise<{
    apiChanges: PlanGenV2ApiChanges;
    affectedEndpoints: ApiEndpoint[];
  }> {
    const allScanRecords = await storage.list<ScanRecord>("scan-records");
    const sourceIdSet = new Set(gitSourceIds);

    // 按 gitSourceId 分组，取最新 completed 的记录
    const latestBySource = new Map<string, ScanRecord>();
    for (const record of allScanRecords) {
      if (!sourceIdSet.has(record.gitSourceId)) continue;
      if (record.status !== "completed") continue;
      if (!record.completedAt) continue;

      const existing = latestBySource.get(record.gitSourceId);
      if (!existing || record.completedAt > (existing.completedAt ?? "")) {
        latestBySource.set(record.gitSourceId, record);
      }
    }

    // 汇总变更
    const added: string[] = [];
    const updated: string[] = [];
    const removed: string[] = [];
    const affectedEndpointIds = new Set<string>();

    for (const record of latestBySource.values()) {
      if (!record.result?.changes) continue;

      for (const change of record.result.changes) {
        const label = `${change.method} ${change.path}`;
        switch (change.type) {
          case "added":
            added.push(label);
            break;
          case "updated":
            updated.push(label);
            break;
          case "removed":
            removed.push(label);
            break;
        }
        if (change.endpointId) {
          affectedEndpointIds.add(change.endpointId);
        }
      }
    }

    // 查询受影响的端点详情
    let affectedEndpoints: ApiEndpoint[] = [];
    if (affectedEndpointIds.size > 0) {
      const allEndpoints = await storage.list<ApiEndpoint>("api-endpoints");
      affectedEndpoints = allEndpoints.filter((ep) => affectedEndpointIds.has(ep.id));
    }

    return {
      apiChanges: { added, updated, removed },
      affectedEndpoints,
    };
  }

  // ── 端点转换 ────────────────────────────────────────────────────────────

  /**
   * 将 ApiEndpoint[] 转换为 prompt 模板需要的 PlanGenV2Endpoint[] 格式
   */
  private toPromptEndpoints(endpoints: ApiEndpoint[]): PlanGenV2Endpoint[] {
    return endpoints.map((ep) => ({
      method: ep.method,
      path: ep.path,
      summary: ep.summary || "",
    }));
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
