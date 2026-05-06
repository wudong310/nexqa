import { Hono } from "hono";
import { createLogger } from "../services/logger.js";
import {
  analyzeBatchRun,
  analyzeSingleResult,
  type FailureAnalysis,
} from "../services/ai-analysis.js";
import { storage } from "../services/storage.js";

export const analysisRoutes = new Hono()
  // POST /api/analysis/batch — analyze all failures in a batch（body: batchRunId）
  .post("/batch", async (c) => {
    const log = createLogger("analysis-routes", c.req.header("x-trace-id"));
    const body = await c.req.json<{ batchRunId?: string; force?: boolean }>().catch(() => ({}));
    const batchRunId = (body as { batchRunId?: string }).batchRunId;
    if (!batchRunId) {
      return c.json({ error: "batchRunId is required" }, 400);
    }
    const force = (body as { force?: boolean }).force === true;

    log.info(`触发批次分析: ${batchRunId}, force=${force}`);

    try {
      const analysis = await analyzeBatchRun(batchRunId, force);
      return c.json(analysis);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`批次分析失败: ${msg}`);
      return c.json({ error: msg }, 500);
    }
  })
  // POST /api/analysis/case/result — 获取已缓存的单例分析结果（body: testResultId）
  .post("/case/result", async (c) => {
    const body = await c.req.json<{ testResultId?: string }>().catch(() => ({}));
    const testResultId = (body as { testResultId?: string }).testResultId;
    if (!testResultId) {
      return c.json({ error: "testResultId is required" }, 400);
    }

    // 在 failure-analyses 中查找包含此 testResultId 的分析
    const allAnalyses = await storage.list<FailureAnalysis>("failure-analyses");
    for (const analysis of allAnalyses) {
      for (const group of analysis.groups) {
        for (const item of group.items) {
          if (item.resultId === testResultId) {
            return c.json({
              analysisId: analysis.id,
              batchRunId: analysis.batchRunId,
              group: group.category,
              suggestion: item.suggestion,
              resultId: item.resultId,
              caseId: item.caseId,
            });
          }
        }
      }
    }

    return c.json({ error: "Analysis not found for this test result" }, 404);
  })
  // POST /api/analysis/case — analyze a single failure（body: testResultId）
  .post("/case", async (c) => {
    const log = createLogger("analysis-routes", c.req.header("x-trace-id"));
    const body = await c.req.json<{ testResultId?: string }>().catch(() => ({}));
    const testResultId = (body as { testResultId?: string }).testResultId;
    if (!testResultId) {
      return c.json({ error: "testResultId is required" }, 400);
    }

    log.info(`触发单例分析: ${testResultId}`);

    try {
      const analysis = await analyzeSingleResult(testResultId);
      return c.json(analysis);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`单例分析失败: ${msg}`);
      return c.json({ error: msg }, 500);
    }
  })
  // POST /api/analysis/batch/result — get cached analysis for a batch（body: batchRunId）
  .post("/batch/result", async (c) => {
    const body = await c.req.json<{ batchRunId?: string }>().catch(() => ({}));
    const batchRunId = (body as { batchRunId?: string }).batchRunId;
    if (!batchRunId) {
      return c.json({ error: "batchRunId is required" }, 400);
    }

    const all = await storage.list<FailureAnalysis>("failure-analyses");
    const analysis = all.find((a) => a.batchRunId === batchRunId);
    if (!analysis) {
      return c.json({ error: "Analysis not found" }, 404);
    }
    return c.json(analysis);
  });
