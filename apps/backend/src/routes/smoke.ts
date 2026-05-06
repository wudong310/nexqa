import type { Project } from "@nexqa/shared";
import { Hono } from "hono";
import { createLogger } from "../services/logger.js";
import {
  executeSmoke,
  generateSmokePlan,
  getSmokeTask,
} from "../services/smoke-test.js";
import { storage } from "../services/storage.js";

export const smokeRoutes = new Hono()
  // POST /api/smoke/generate — generate smoke plan without executing
  .post("/generate", async (c) => {
    const log = createLogger("smoke-routes", c.req.header("x-trace-id"));
    const body = await c.req.json<{ projectId: string }>();

    if (!body.projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    const project = await storage.read<Project>("projects", body.projectId);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    log.info(`生成冒烟方案: ${project.name}`);

    try {
      const plan = await generateSmokePlan(body.projectId);
      // 防御性兜底：确保 corePaths 始终是数组，totalCases 始终是数字
      return c.json({
        ...plan,
        corePaths: plan.reasoning?.corePaths ?? [],
        totalCases: plan.selectedCaseIds?.length ?? 0,
        selectedCaseIds: plan.selectedCaseIds ?? [],
        executionOrder: plan.executionOrder ?? [],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`冒烟方案生成失败: ${msg}`);
      return c.json({ error: msg }, 500);
    }
  })
  // POST /api/smoke/execute — execute smoke test (async)
  .post("/execute", async (c) => {
    const log = createLogger("smoke-routes", c.req.header("x-trace-id"));
    const body = await c.req.json<{ projectId: string; environmentId?: string }>();

    if (!body.projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    const project = await storage.read<Project>("projects", body.projectId);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    log.info(`执行冒烟测试: ${project.name}`);

    try {
      const task = await executeSmoke(body.projectId, body.environmentId);
      return c.json({
        taskId: task.id,
        batchRunId: task.batchRunId,
        status: task.status,
        message: "AI 正在分析 API 文档，识别核心路径...",
      }, 202);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`冒烟执行失败: ${msg}`);
      return c.json({ error: msg }, 500);
    }
  })
  // GET /api/smoke/status?taskId=xxx — query smoke test progress
  .get("/status", async (c) => {
    const taskId = c.req.query("taskId");
    if (!taskId) {
      return c.json({ error: "taskId is required" }, 400);
    }

    const task = getSmokeTask(taskId);

    if (!task) {
      return c.json({ error: "Smoke test task not found" }, 404);
    }

    return c.json(task);
  });
