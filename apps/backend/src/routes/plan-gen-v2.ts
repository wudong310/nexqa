/**
 * plan-gen-v2 — 基于 OpenClaw Agent 的测试方案生成 API 路由
 *
 * 异步触发 + 轮询模式：
 *   POST /projects/:projectId/plan-gen-v2  → 触发异步生成（202）
 *   GET  /plan-generations-v2/:id          → 轮询生成状态（200）
 */

import type { PlanGenerationV2, Project, TestPlan } from "@nexqa/shared";
import {
  AdoptPlanGenRequestSchema,
  PlanGenV2ResultSchema,
  PlanGenRecordStatusSchema,
} from "@nexqa/shared";
import { Hono } from "hono";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { createLogger } from "../services/logger.js";
import { createOpenClawClient } from "../services/openclaw-client.js";
import { storage } from "../services/storage.js";
import { TestPlanGenV2Service } from "../services/test-plan-gen-v2.js";

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const StartGenerationBodySchema = z.object({
  intent: z.string().min(1, "intent 不能为空"),
  scope: z
    .object({
      gitSourceIds: z.array(z.string()).optional(),
      endpointIds: z.array(z.string()).optional(),
      changedOnly: z.boolean().optional(),
    })
    .optional(),
  openclawConnectionId: z.string().min(1, "openclawConnectionId 不能为空"),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * 获取 OpenClaw Gateway token
 * 优先从 settings 的 openclawToken 字段读取，其次从环境变量
 */
async function getOpenClawToken(): Promise<string | null> {
  try {
    const raw = await storage.readRaw("settings.json");
    if (raw) {
      const settings = JSON.parse(raw);
      if (settings.openclawToken) return settings.openclawToken as string;
    }
  } catch {
    // settings 解析失败，继续尝试环境变量
  }
  return process.env.OPENCLAW_GATEWAY_TOKEN ?? null;
}

/**
 * 服务实例缓存（按 connectionId → service）
 * 每个 openclawConnection 对应一个 service 实例，避免重复创建 client
 */
const serviceCache = new Map<string, TestPlanGenV2Service>();

function getOrCreateService(
  gatewayUrl: string,
  token: string,
  broadcaster?: { broadcast: (event: unknown) => void },
): TestPlanGenV2Service {
  const cacheKey = `${gatewayUrl}::${token}`;
  const cached = serviceCache.get(cacheKey);

  // Bug 11 修复：cached 实例存在时，更新其 broadcaster
  if (cached) {
    if (broadcaster) {
      cached.updateBroadcaster(broadcaster);
    }
    return cached;
  }

  const client = createOpenClawClient({ gatewayUrl, token });
  const service = new TestPlanGenV2Service(client, broadcaster);
  serviceCache.set(cacheKey, service);
  return service;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/** 项目级路由：POST /:projectId/plan-gen-v2 + GET /:projectId/plan-gen-v2/records */
export const planGenV2ProjectRoutes = new Hono()
  // ─── GET /:projectId/plan-gen-v2/records — 获取项目生成记录列表 ───────────
  .get("/:projectId/plan-gen-v2/records", async (c) => {
    const projectId = c.req.param("projectId");
    const statusFilter = c.req.query("status");

    // 1. 校验项目存在
    const project = await storage.read<Project>("projects", projectId);
    if (!project) {
      return c.json({ error: "项目不存在", code: "PROJECT_NOT_FOUND" }, 404);
    }

    // 2. 获取所有生成记录
    const allRecords = await storage.list<PlanGenerationV2>("plan-generations-v2");
    let filtered = allRecords.filter((r) => r.projectId === projectId);

    // 3. 状态兼容映射：completed → completed_pending, pending → generating
    const mappedRecords = filtered.map((r) => {
      let displayStatus = r.status;
      if (r.status === "completed") {
        displayStatus = r.adoptedPlanId ? "completed_adopted" : "completed_pending";
      } else if (r.status === "pending") {
        displayStatus = "generating";
      }
      return { ...r, status: displayStatus };
    });

    // 4. 可选状态筛选
    if (statusFilter) {
      const statusParse = PlanGenRecordStatusSchema.safeParse(statusFilter);
      if (!statusParse.success) {
        return c.json({ error: "无效的 status 参数" }, 400);
      }
      filtered = mappedRecords.filter((r) => r.status === statusFilter);
    } else {
      filtered = mappedRecords;
    }

    // 5. 按 startedAt 倒序
    filtered.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );

    return c.json({ records: filtered });
  })

  // ─── POST /:projectId/plan-gen-v2 — 触发生成 ───────────────────────────────
  .post("/:projectId/plan-gen-v2", async (c) => {
    const log = createLogger("plan-gen-v2", c.req.header("x-trace-id"));
    const projectId = c.req.param("projectId");

    // 1. 解析 + 校验请求体
    const rawBody = await c.req.json().catch(() => null);
    if (!rawBody) {
      return c.json({ error: "请求体不能为空" }, 400);
    }

    const parseResult = StartGenerationBodySchema.safeParse(rawBody);
    if (!parseResult.success) {
      const messages = parseResult.error.errors.map((e) =>
        e.path.length > 0 ? `${e.path.join(".")}: ${e.message}` : e.message,
      );
      return c.json({ error: messages.join("; ") }, 400);
    }
    const body = parseResult.data;

    // 2. 校验项目存在
    const project = await storage.read<Project>("projects", projectId);
    if (!project) {
      return c.json({ error: "项目不存在" }, 404);
    }

    // 3. 校验 OpenClaw 连接配置
    const conn = project.openclawConnections?.find(
      (item) => item.id === body.openclawConnectionId,
    );
    if (!conn) {
      return c.json({ error: "OpenClaw 连接配置不存在" }, 400);
    }

    // 4. 获取 token
    const token = await getOpenClawToken();
    if (!token) {
      return c.json(
        {
          error:
            "OpenClaw Gateway token 未配置，请在设置中配置 openclawToken 或设置环境变量 OPENCLAW_GATEWAY_TOKEN",
        },
        400,
      );
    }

    // 5. 获取/创建 service 实例并启动生成
    const broadcaster = (c.var as unknown as { broadcaster?: { broadcast: (event: unknown) => void } }).broadcaster;
    const service = getOrCreateService(conn.gatewayUrl, token, broadcaster);

    try {
      const generation = await service.startGeneration({
        projectId,
        intent: body.intent,
        scope: body.scope,
        openclawConnectionId: body.openclawConnectionId,
      });

      log.info(
        `方案生成已触发: id=${generation.id}, projectId=${projectId}, intent="${body.intent}"`,
      );

      return c.json(
        {
          id: generation.id,
          status: generation.status,
          message: "正在通过 OpenClaw 生成测试方案...",
        },
        202,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`方案生成启动失败: ${msg}`);
      return c.json({ error: msg }, 500);
    }
  },
);

// ─── Shared Helpers ───────────────────────────────────────────────────────────

/**
 * 从 serviceCache 中查找 generation 记录
 *
 * 遍历所有 service 实例（按 connectionId 分组），返回第一个匹配的 generation。
 */
async function findGeneration(id: string): Promise<PlanGenerationV2 | null> {
  return storage.read<PlanGenerationV2>("plan-generations-v2", id);
}

/** 轮询路由：GET /plan-generations-v2/:id + PUT result/error */
export const planGenV2PollRoutes = new Hono()
  .get("/plan-generations-v2/:id", async (c) => {
    const id = c.req.param("id");

    const gen = await findGeneration(id);
    if (!gen) {
      return c.json({ error: "生成记录不存在" }, 404);
    }

    // 状态兼容映射
    let displayStatus = gen.status;
    if (gen.status === "completed") {
      displayStatus = gen.adoptedPlanId ? "completed_adopted" : "completed_pending";
    } else if (gen.status === "pending") {
      displayStatus = "generating";
    }

    // 根据状态返回不同结构
    switch (gen.status) {
      case "pending":
      case "generating":
        return c.json({
          id: gen.id,
          status: displayStatus,
          progress:
            gen.status === "pending" ? "等待启动..." : "正在分析 API 变更...",
          logs: gen.logs || [],
        });
      case "completed":
        return c.json({
          id: gen.id,
          status: displayStatus,
          result: gen.result,
          adoptedPlanId: gen.adoptedPlanId,
          logs: gen.logs || [],
        });
      case "failed":
        return c.json({
          id: gen.id,
          status: displayStatus,
          error: gen.error,
          logs: gen.logs || [],
        });
    }
  })

  // ─── PUT /plan-generations-v2/:id/result ─────────────────────────────────
  // Agent 完成后通过 submit-plan.ts 调用此路由回写结构化结果
  .put("/plan-generations-v2/:id/result", async (c) => {
    const log = createLogger("plan-gen-v2", c.req.header("x-trace-id"));
    const id = c.req.param("id");

    // 1. 解析请求体
    const rawBody = await c.req.json().catch(() => null);
    if (!rawBody) {
      return c.json({ error: "请求体不能为空" }, 400);
    }

    // 2. Zod 校验
    const parseResult = PlanGenV2ResultSchema.safeParse(rawBody);
    if (!parseResult.success) {
      const messages = parseResult.error.errors.map((e) =>
        e.path.length > 0 ? `${e.path.join(".")}: ${e.message}` : e.message,
      );
      return c.json({ error: `结果格式校验失败: ${messages.join("; ")}` }, 400);
    }

    // 3. 查找 generation 记录
    const generation = await findGeneration(id);
    if (!generation) {
      return c.json({ error: "生成记录不存在" }, 404);
    }

    // 4. 状态校验（已终态时仅 warn，仍允许覆写以支持幂等重试）
    if (generation.status === "completed" || generation.status === "failed") {
      log.warn(`generation ${id} 已终态 (${generation.status})，覆写结果`);
    }

    // 5. 更新记录（持久化）
    // 注意：状态改为 completed_pending，表示待采纳
    generation.status = "completed"; // 存储层保持 completed
    generation.result = parseResult.data;
    generation.completedAt = new Date().toISOString();
    generation.error = null;

    await storage.write("plan-generations-v2", id, generation);

    log.info(`方案结果已回写: id=${id}, plan="${parseResult.data.plan.name}"`);

    return c.json({
      ok: true,
      id: generation.id,
      status: generation.status,
    });
  })

  // ─── PUT /plan-generations-v2/:id/error ──────────────────────────────────
  // Agent 执行失败时调用此路由上报错误
  .put("/plan-generations-v2/:id/error", async (c) => {
    const log = createLogger("plan-gen-v2", c.req.header("x-trace-id"));
    const id = c.req.param("id");

    const body = await c.req.json().catch(() => null);
    const errorMsg = body?.error || "未知错误";

    const generation = await findGeneration(id);
    if (!generation) {
      return c.json({ error: "生成记录不存在" }, 404);
    }

    generation.status = "failed";
    generation.error = String(errorMsg);
    generation.completedAt = new Date().toISOString();

    await storage.write("plan-generations-v2", id, generation);

    log.info(`方案生成标记失败: id=${id}, error="${errorMsg}"`);

    return c.json({ ok: true, id: generation.id, status: "failed" });
  })

  // ─── POST /plan-generations-v2/:id/adopt — 采纳生成结果 ──────────────────
  .post("/plan-generations-v2/:id/adopt", async (c) => {
    const log = createLogger("plan-gen-v2", c.req.header("x-trace-id"));
    const id = c.req.param("id");

    // 1. 查找生成记录
    const generation = await findGeneration(id);
    if (!generation) {
      return c.json(
        { error: "生成记录不存在", code: "GENERATION_NOT_FOUND" },
        404,
      );
    }

    // 2. 状态校验
    if (
      generation.status !== "completed" &&
      generation.status !== "completed_pending"
    ) {
      return c.json(
        { error: "生成未完成，无法采纳", code: "GENERATION_NOT_COMPLETED" },
        400,
      );
    }

    // 3. 检查是否已采纳
    if (generation.adoptedPlanId) {
      return c.json(
        { error: "已被采纳，不能重复采纳", code: "GENERATION_ALREADY_ADOPTED" },
        400,
      );
    }

    // 4. 检查结果是否为空
    if (!generation.result) {
      return c.json(
        { error: "结果为空，无法采纳", code: "GENERATION_RESULT_EMPTY" },
        400,
      );
    }

    // 5. 解析可选请求体
    const rawBody = await c.req.json().catch(() => ({}));
    const parseResult = AdoptPlanGenRequestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      const messages = parseResult.error.errors.map((e) =>
        e.path.length > 0 ? `${e.path.join(".")}: ${e.message}` : e.message,
      );
      return c.json({ error: messages.join("; ") }, 400);
    }
    const override = parseResult.data;

    // 6. 从 result.plan 构建 TestPlan 对象
    const planId = uuid();
    const now = new Date().toISOString();
    const planResult = generation.result.plan;

    const testPlan: TestPlan = {
      id: planId,
      projectId: generation.projectId,
      name: override.name || planResult.name,
      description: override.description ?? planResult.description,
      selection: {}, // 从 result.plan.stages 提取 selection（简化实现）
      execution: {
        environmentId: null,
        stages: true,
        concurrency: planResult.execution.concurrency,
        retryOnFail: planResult.execution.retryOnFail,
        timeoutMs: planResult.execution.timeoutMs,
        stopOnGateFail: planResult.execution.stopOnGateFail,
      },
      criteria: {
        minPassRate: planResult.criteria.minPassRate,
        maxP0Fails: planResult.criteria.maxP0Fails,
        maxP1Fails: planResult.criteria.maxP1Fails,
      },
      createdAt: now,
      updatedAt: now,
    };

    // 7. 写入 test-plans
    await storage.write("test-plans", planId, testPlan);

    // 8. 更新 generation 记录
    generation.adoptedPlanId = planId;
    await storage.write("plan-generations-v2", id, generation);

    log.info(
      `方案已采纳: generationId=${id}, planId=${planId}, name="${testPlan.name}"`,
    );

    return c.json({
      planId,
      plan: testPlan,
    });
  })

  // ─── DELETE /plan-generations-v2/:id — 丢弃生成记录 ──────────────────────
  .delete("/plan-generations-v2/:id", async (c) => {
    const log = createLogger("plan-gen-v2", c.req.header("x-trace-id"));
    const id = c.req.param("id");

    // 1. 查找生成记录
    const generation = await findGeneration(id);
    if (!generation) {
      return c.json(
        { error: "生成记录不存在", code: "GENERATION_NOT_FOUND" },
        404,
      );
    }

    // 2. 检查是否已采纳
    if (generation.adoptedPlanId) {
      return c.json(
        { error: "已采纳的记录不能丢弃", code: "GENERATION_ADOPTED" },
        400,
      );
    }

    // 3. 删除记录
    await storage.remove("plan-generations-v2", id);

    log.info(`生成记录已丢弃: id=${id}`);

    return c.json({ ok: true });
  });
