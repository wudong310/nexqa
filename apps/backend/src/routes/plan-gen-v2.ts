/**
 * plan-gen-v2 — 基于 OpenClaw Agent 的测试方案生成 API 路由
 *
 * 异步触发 + 轮询模式：
 *   POST /projects/:projectId/plan-gen-v2  → 触发异步生成（202）
 *   GET  /plan-generations-v2/:id          → 轮询生成状态（200）
 */

import { z } from "zod";
import { Hono } from "hono";
import type { Project } from "@nexqa/shared";
import { createLogger } from "../services/logger.js";
import { createOpenClawClient } from "../services/openclaw-client.js";
import { TestPlanGenV2Service } from "../services/test-plan-gen-v2.js";
import { storage } from "../services/storage.js";

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
): TestPlanGenV2Service {
  const cacheKey = `${gatewayUrl}::${token}`;
  const cached = serviceCache.get(cacheKey);
  if (cached) return cached;

  const client = createOpenClawClient({ gatewayUrl, token });
  const service = new TestPlanGenV2Service(client);
  serviceCache.set(cacheKey, service);
  return service;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/** 项目级路由：POST /:projectId/plan-gen-v2 */
export const planGenV2ProjectRoutes = new Hono()
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
      const messages = parseResult.error.errors.map(
        (e) => e.path.length > 0 ? `${e.path.join(".")}: ${e.message}` : e.message,
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
    const service = getOrCreateService(conn.gatewayUrl, token);

    try {
      const generation = service.startGeneration({
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
  });

/** 轮询路由：GET /plan-generations-v2/:id */
export const planGenV2PollRoutes = new Hono()
  .get("/plan-generations-v2/:id", async (c) => {
    const id = c.req.param("id");

    // 遍历所有 service 实例查找 generation
    for (const service of serviceCache.values()) {
      const gen = service.getGeneration(id);
      if (gen) {
        // 根据状态返回不同结构
        switch (gen.status) {
          case "pending":
          case "generating":
            return c.json({
              id: gen.id,
              status: gen.status,
              progress: gen.status === "pending"
                ? "等待启动..."
                : "正在分析 API 变更...",
            });
          case "completed":
            return c.json({
              id: gen.id,
              status: gen.status,
              result: gen.result,
            });
          case "failed":
            return c.json({
              id: gen.id,
              status: gen.status,
              error: gen.error,
            });
        }
      }
    }

    return c.json({ error: "生成记录不存在" }, 404);
  });
