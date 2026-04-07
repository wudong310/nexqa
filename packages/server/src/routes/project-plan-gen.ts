/**
 * Project-scoped plan-gen routes
 *
 * 前端调用路径以 /projects/plan-gen/... 为前缀，
 * 此文件将这些路径适配到已有的 plan-gen 路由逻辑。
 *
 * 前端调用:
 *   POST /projects/plan-gen/generate  → POST /plan-gen/generate（body: projectId）
 *   GET  /projects/plan-gen/templates → GET  /plan-gen/templates
 *   POST /projects/plan-gen/adopt     → POST /plan-gen/adopt
 */

import { Hono } from "hono";
import { createLogger } from "../services/logger.js";
import {
  adoptPlan,
  generatePlanFromIntent,
  getTemplateList,
} from "../services/plan-generator.js";

export const projectPlanGenRoutes = new Hono()

  // GET /projects/plan-gen/templates — 获取预置模板列表
  .get("/plan-gen/templates", async (c) => {
    const templates = getTemplateList();
    return c.json(templates);
  })

  // POST /projects/plan-gen/generate — 根据自然语言意图生成测试方案（body: projectId）
  .post("/plan-gen/generate", async (c) => {
    const log = createLogger("project-plan-gen", c.req.header("x-trace-id"));
    const body = await c.req.json().catch(() => ({}));

    const { projectId, intent, environmentId } = body as {
      projectId?: string;
      intent?: string;
      environmentId?: string;
    };

    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }
    if (!intent || intent.trim().length === 0) {
      return c.json({ error: "intent is required" }, 400);
    }

    try {
      log.info(`生成方案请求: projectId=${projectId}, intent="${intent}"`);
      const result = await generatePlanFromIntent(
        projectId,
        intent.trim(),
        environmentId,
      );
      return c.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`方案生成失败: ${msg}`);
      if (msg.includes("not found")) {
        return c.json({ error: msg }, 404);
      }
      return c.json({ error: msg }, 500);
    }
  })

  // POST /projects/plan-gen/adopt — 采纳方案，创建正式 TestPlan
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
  });
