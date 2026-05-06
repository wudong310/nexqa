/**
 * Project-scoped trend & quality-risk routes
 *
 * 前端调用路径以 /projects/... 为前缀，
 * 此文件将这些路径适配到已有的 trend-analyzer 服务。
 *
 * 前端调用:
 *   GET  /projects/trend-insights?projectId=xxx                 → getInsights(projectId)
 *   GET  /projects/quality-risks?projectId=xxx                  → getRisks(projectId)
 *   POST /projects/quality-risks/dismiss                        → dismissRisk（body: riskId）
 *   POST /projects/trend-analysis                               → analyzeTrends（body: projectId）
 */

import { Hono } from "hono";
import { createLogger } from "../services/logger.js";
import {
  analyzeTrends,
  getInsights,
  getRisks,
  dismissRisk,
} from "../services/trend-analyzer.js";

export const projectTrendRoutes = new Hono()

  // GET /projects/trend-insights?projectId=xxx — 获取趋势洞察
  .get("/trend-insights", async (c) => {
    const log = createLogger("project-trends", c.req.header("x-trace-id"));
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    log.info(`获取趋势洞察: projectId=${projectId}`);

    try {
      const insights = await getInsights(projectId);
      return c.json(insights);
    } catch (err) {
      log.error("获取洞察失败", err);
      return c.json(
        { error: err instanceof Error ? err.message : "Internal error" },
        500,
      );
    }
  })

  // GET /projects/quality-risks?projectId=xxx — 获取质量风险预警
  .get("/quality-risks", async (c) => {
    const log = createLogger("project-trends", c.req.header("x-trace-id"));
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    log.info(`获取质量风险: projectId=${projectId}`);

    try {
      const risks = await getRisks(projectId);
      return c.json(risks);
    } catch (err) {
      log.error("获取风险预警失败", err);
      return c.json(
        { error: err instanceof Error ? err.message : "Internal error" },
        500,
      );
    }
  })

  // POST /projects/quality-risks/dismiss — 忽略风险预警（body: riskId）
  .post("/quality-risks/dismiss", async (c) => {
    const log = createLogger("project-trends", c.req.header("x-trace-id"));
    const body = await c.req.json<{ riskId?: string }>().catch(() => ({}));
    const riskId = (body as { riskId?: string }).riskId;
    if (!riskId) {
      return c.json({ error: "riskId is required" }, 400);
    }

    log.info(`忽略风险预警: riskId=${riskId}`);

    try {
      const ok = await dismissRisk(riskId);
      if (!ok) {
        return c.json({ error: "Risk not found" }, 404);
      }
      return c.json({ success: true });
    } catch (err) {
      log.error("忽略预警失败", err);
      return c.json(
        { error: err instanceof Error ? err.message : "Internal error" },
        500,
      );
    }
  })

  // POST /projects/trend-analysis — 触发趋势 AI 分析（body: projectId）
  .post("/trend-analysis", async (c) => {
    const log = createLogger("project-trends", c.req.header("x-trace-id"));

    let body: { projectId?: string; timeRange?: string; force?: boolean };
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }

    const projectId = body.projectId;
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    const timeRange = body.timeRange || "30d";
    if (!/^\d+d$/.test(timeRange)) {
      return c.json({ error: "Invalid timeRange. Use format: 7d, 30d, 90d" }, 400);
    }

    const force = body.force === true;

    log.info(`触发趋势分析: projectId=${projectId}, timeRange=${timeRange}, force=${force}`);

    try {
      const result = await analyzeTrends(projectId, timeRange, force);
      return c.json(result);
    } catch (err) {
      log.error("趋势分析失败", err);
      return c.json(
        { error: err instanceof Error ? err.message : "Internal error" },
        500,
      );
    }
  });
