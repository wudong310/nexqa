/**
 * Project-scoped plan-gen routes（V1/V2 统一入口 + 降级逻辑）
 *
 * 路由策略：
 * - planGenVersion = "auto"（默认）：有有效 OpenClaw 连接用 V2，无则降级 V1
 * - planGenVersion = "v1"：强制 V1（LLM 直调 + 规则引擎）
 * - planGenVersion = "v2"：强制 V2（OpenClaw Agent），无连接时报错
 *
 * 前端调用路径以 /projects/plan-gen/... 为前缀。
 */

import { Hono } from "hono";
import type { Project, PlanGenV2Status } from "@nexqa/shared";
import { createLogger } from "../services/logger.js";
import {
  adoptPlan,
  generatePlanFromIntent,
  getTemplateList,
} from "../services/plan-generator.js";
import {
  TestPlanGenV2Service,
  type PlanGenV2Request,
} from "../services/test-plan-gen-v2.js";
import {
  createOpenClawClient,
  type OpenClawClientConfig,
} from "../services/openclaw-client.js";
import { storage } from "../services/storage.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * 检查项目是否有有效的 OpenClaw 连接配置
 * 返回第一个有效连接或 null
 */
function getValidOpenClawConnection(
  project: Project,
  connectionId?: string,
): Project["openclawConnections"][number] | null {
  if (!project.openclawConnections || project.openclawConnections.length === 0) {
    return null;
  }

  // 如果指定了 connectionId，精确查找
  if (connectionId) {
    return (
      project.openclawConnections.find((c) => c.id === connectionId) ?? null
    );
  }

  // 否则返回第一个连接
  return project.openclawConnections[0] ?? null;
}

/**
 * 判定实际使用的方案生成版本
 *
 * 返回:
 * - "v1" — 使用 V1 (LLM 直调 + 规则引擎)
 * - "v2" — 使用 V2 (OpenClaw Agent)
 * - "error" — 配置冲突（如 v2 但无连接）
 */
function resolveVersion(
  project: Project,
  connectionId?: string,
): { version: "v1" | "v2"; error?: never } | { version: "error"; error: string } {
  const planGenVersion = (project as Record<string, unknown>).planGenVersion as
    | "v1"
    | "v2"
    | "auto"
    | undefined ?? "auto";
  const hasConnection = getValidOpenClawConnection(project, connectionId) !== null;

  switch (planGenVersion) {
    case "v1":
      return { version: "v1" };

    case "v2":
      if (!hasConnection) {
        return {
          version: "error",
          error: "项目配置为强制 V2 方案生成，但未配置有效的 OpenClaw 连接。请在项目设置中添加 OpenClaw 连接。",
        };
      }
      return { version: "v2" };

    case "auto":
    default:
      // auto 模式：有连接用 V2，无连接降级 V1
      return { version: hasConnection ? "v2" : "v1" };
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export const projectPlanGenRoutes = new Hono()

  // GET /projects/plan-gen/templates — 获取预置模板列表
  .get("/plan-gen/templates", async (c) => {
    const templates = getTemplateList();
    return c.json(templates);
  })

  // POST /projects/plan-gen/generate — 根据自然语言意图生成测试方案
  //
  // 降级逻辑：
  // 1. 读取项目 planGenVersion 配置
  // 2. auto 模式下检查 openclawConnectionId 是否有效
  // 3. 有效 → V2（OpenClaw Agent），无效 → V1（LLM 直调 + 规则引擎）
  // 4. 响应中包含 { version: "v1"|"v2", degraded?: boolean } 供前端感知
  .post("/plan-gen/generate", async (c) => {
    const log = createLogger("project-plan-gen", c.req.header("x-trace-id"));
    const body = await c.req.json().catch(() => ({}));

    const { projectId, intent, environmentId, openclawConnectionId } = body as {
      projectId?: string;
      intent?: string;
      environmentId?: string;
      openclawConnectionId?: string;
    };

    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }
    if (!intent || intent.trim().length === 0) {
      return c.json({ error: "intent is required" }, 400);
    }

    // 读取项目信息
    const project = await storage.read<Project>("projects", projectId);
    if (!project) {
      return c.json({ error: `Project ${projectId} not found` }, 404);
    }

    // 版本决策
    const resolution = resolveVersion(project, openclawConnectionId);

    if (resolution.version === "error") {
      log.warn(`方案生成版本冲突: ${resolution.error}`);
      return c.json(
        {
          error: resolution.error,
          version: "v2",
          degraded: false,
          configHint: "请在项目设置中添加 OpenClaw 连接，或将 planGenVersion 改为 \"auto\" 或 \"v1\"",
        },
        400,
      );
    }

    // ─── V1 路径（LLM 直调 + 规则引擎）───────────────────────────────────
    if (resolution.version === "v1") {
      const degraded = (
        (project as Record<string, unknown>).planGenVersion as string | undefined
      ) === "auto" || !(project as Record<string, unknown>).planGenVersion;

      log.info(
        `使用 V1 方案生成: projectId=${projectId}, degraded=${degraded}`,
      );

      try {
        const result = await generatePlanFromIntent(
          projectId,
          intent.trim(),
          environmentId,
        );
        return c.json({
          ...result,
          version: "v1" as const,
          degraded,
          ...(degraded && {
            degradeReason: "未配置 OpenClaw 连接，已自动降级为 V1（LLM 直调 + 规则引擎）",
          }),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(`V1 方案生成失败: ${msg}`);
        if (msg.includes("not found")) {
          return c.json({ error: msg }, 404);
        }
        return c.json({ error: msg }, 500);
      }
    }

    // ─── V2 路径（OpenClaw Agent）─────────────────────────────────────────
    const connection = getValidOpenClawConnection(project, openclawConnectionId)!;
    log.info(
      `使用 V2 方案生成: projectId=${projectId}, connection=${connection.name}`,
    );

    try {
      // 创建 OpenClaw 客户端并启动 V2 生成
      const clientConfig: OpenClawClientConfig = {
        gatewayUrl: connection.gatewayUrl,
        token: "", // shared-secret 从连接配置获取（实际使用时需补充）
        timeout: connection.timeout?.chat ?? 30000,
      };
      const openclawClient = createOpenClawClient(clientConfig);
      const v2Service = new TestPlanGenV2Service(openclawClient);

      const v2Request: PlanGenV2Request = {
        projectId,
        intent: intent.trim(),
        openclawConnectionId: connection.id,
        scope: undefined,
      };

      const generation = v2Service.startGeneration(v2Request);

      return c.json({
        id: generation.id,
        projectId: generation.projectId,
        status: generation.status as PlanGenV2Status,
        intent: generation.intent,
        version: "v2" as const,
        degraded: false,
        openclawConnectionId: connection.id,
        openclawConnectionName: connection.name,
        startedAt: generation.startedAt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`V2 方案生成启动失败: ${msg}`);
      return c.json({ error: msg, version: "v2" }, 500);
    }
  })

  // POST /projects/plan-gen/adopt — 采纳方案，创建正式 TestPlan（V1 专用）
  .post("/plan-gen/adopt", async (c) => {
    const log = createLogger("project-plan-gen", c.req.header("x-trace-id"));
    const body = await c.req.json().catch(() => ({}));

    const { generationId, modifications } = body as {
      generationId?: string;
      modifications?: Record<string, unknown>;
    };

    if (!generationId) {
      return c.json({ error: "generationId is required" }, 400);
    }

    try {
      log.info(`采纳方案: generationId=${generationId}`);
      const plan = await adoptPlan(
        generationId,
        modifications as Parameters<typeof adoptPlan>[1],
      );
      return c.json(plan, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`采纳失败: ${msg}`);
      if (msg.includes("not found")) {
        return c.json({ error: msg }, 404);
      }
      return c.json({ error: msg }, 500);
    }
  })

  // GET /projects/plan-gen/version-info — 查询当前项目的方案生成版本信息
  .get("/plan-gen/version-info", async (c) => {
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return c.json({ error: "projectId query param is required" }, 400);
    }

    const project = await storage.read<Project>("projects", projectId);
    if (!project) {
      return c.json({ error: `Project ${projectId} not found` }, 404);
    }

    const planGenVersion = (project as Record<string, unknown>).planGenVersion as
      | "v1"
      | "v2"
      | "auto"
      | undefined ?? "auto";
    const hasConnections = project.openclawConnections.length > 0;
    const resolution = resolveVersion(project);

    return c.json({
      configured: planGenVersion,
      effective: resolution.version === "error" ? "v2" : resolution.version,
      hasOpenClawConnections: hasConnections,
      connectionCount: project.openclawConnections.length,
      connections: project.openclawConnections.map((conn) => ({
        id: conn.id,
        name: conn.name,
      })),
      ...(resolution.version === "error" && { error: resolution.error }),
    });
  });
