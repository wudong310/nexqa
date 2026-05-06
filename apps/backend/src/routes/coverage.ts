import { Hono } from "hono";
import { calculateCoverage } from "../services/coverage-engine.js";
import { createLogger } from "../services/logger.js";

export const coverageRoutes = new Hono()
  // GET /api/projects/:projectId/coverage
  .get("/", async (c) => {
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return c.json({ error: "projectId query parameter is required" }, 400);
    }
    const log = createLogger("coverage", c.req.header("x-trace-id"));
    log.info(`计算覆盖率: projectId=${projectId}`);

    try {
      const coverage = await calculateCoverage(projectId);
      // 防御性兜底：确保所有数组字段不为 undefined
      return c.json({
        ...coverage,
        endpoints: coverage.endpoints ?? [],
        details: {
          ...(coverage.details ?? {}),
          totalEndpoints: coverage.details?.totalEndpoints ?? 0,
          coveredEndpoints: coverage.details?.coveredEndpoints ?? 0,
          totalMethods: coverage.details?.totalMethods ?? 0,
          coveredMethods: coverage.details?.coveredMethods ?? 0,
          totalStatusCodes: coverage.details?.totalStatusCodes ?? 0,
          coveredStatusCodes: coverage.details?.coveredStatusCodes ?? 0,
        },
        // 前端可能期望的额外数组字段
        matrix: (coverage as any).matrix ?? [],
        suggestions: (coverage as any).suggestions ?? [],
      });
    } catch (err) {
      log.error("覆盖率计算失败", err);
      return c.json(
        { error: err instanceof Error ? err.message : "Internal error" },
        500,
      );
    }
  });
