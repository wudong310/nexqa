/**
 * Project-scoped security scan routes
 *
 * 前端调用路径以 /projects/... 或 /security-scan/... 为前缀，
 * 此文件将这些路径适配到已有的 security 路由逻辑。
 *
 * 前端调用:
 *   POST /projects/security-scan                    → POST /security/scan（body: projectId）
 *   GET  /security-scan?scanId=xxx                  → GET  /security/status（query: scanId）
 *   GET  /security-scan/report?scanId=xxx           → GET  /security/report（query: scanId）
 *   GET  /security-scan/surface?scanId=xxx          → GET  /security/attack-surface（query: scanId）
 */

import { Hono } from "hono";
import { createLogger } from "../services/logger.js";
import {
  startSecurityScan,
  getScanStatus,
  getAttackSurface,
} from "../services/security-scanner.js";
import type { SecurityTestType } from "../services/security-types.js";

const VALID_TEST_TYPES: SecurityTestType[] = [
  "sql-injection",
  "xss",
  "path-traversal",
  "auth-bypass",
  "idor",
  "mass-assignment",
  "rate-limit",
  "info-disclosure",
  "ssrf",
  "command-injection",
  "overflow",
];

export const projectSecurityRoutes = new Hono()

  // POST /projects/security-scan — 启动安全扫描（body: projectId）
  .post("/security-scan", async (c) => {
    const log = createLogger("project-security", c.req.header("x-trace-id"));
    const body = await c.req.json().catch(() => ({}));

    const { projectId, environmentId, scope, endpointIds, testTypes } = body as {
      projectId?: string;
      environmentId?: string;
      scope?: "all" | "selected";
      endpointIds?: string[];
      testTypes?: string[];
    };

    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }
    if (!environmentId) {
      return c.json({ error: "environmentId 是必需的" }, 400);
    }

    const validTestTypes: SecurityTestType[] | undefined = testTypes?.length
      ? testTypes.filter((t): t is SecurityTestType =>
          VALID_TEST_TYPES.includes(t as SecurityTestType),
        )
      : undefined;

    log.info(`启动安全扫描: project=${projectId}, env=${environmentId}`);

    try {
      const scan = await startSecurityScan({
        projectId,
        environmentId,
        scope: scope || "all",
        endpointIds,
        testTypes: validTestTypes,
      });

      return c.json(
        {
          scanId: scan.id,
          status: scan.status,
          message: "AI 正在分析 API 攻击面...",
        },
        202,
      );
    } catch (err) {
      log.error("启动扫描失败", err);
      return c.json(
        { error: err instanceof Error ? err.message : "启动扫描失败" },
        500,
      );
    }
  });

// ── 独立的 security-scan 路由（不带 /projects 前缀） ──

export const securityScanRoutes = new Hono()

  // GET /security-scan?scanId=xxx — 查询扫描进度
  .get("/", async (c) => {
    const scanId = c.req.query("scanId");
    if (!scanId) {
      return c.json({ error: "scanId is required" }, 400);
    }

    const scan = await getScanStatus(scanId);

    if (!scan) {
      return c.json({ error: "扫描任务不存在" }, 404);
    }

    return c.json({
      id: scan.id,
      status: scan.status,
      progress: scan.progress,
      attackSurfaces: scan.attackSurfaces ?? [],
      generatedCaseIds: scan.generatedCaseIds ?? [],
      batchRunId: scan.batchRunId,
      error: scan.error,
      createdAt: scan.createdAt,
      completedAt: scan.completedAt,
    });
  })

  // GET /security-scan/report?scanId=xxx — 获取安全报告
  .get("/report", async (c) => {
    const scanId = c.req.query("scanId");
    if (!scanId) {
      return c.json({ error: "scanId is required" }, 400);
    }

    const scan = await getScanStatus(scanId);

    if (!scan) {
      return c.json({ error: "扫描任务不存在" }, 404);
    }

    if (scan.status !== "completed") {
      return c.json(
        {
          error: "扫描尚未完成",
          status: scan.status,
          progress: scan.progress,
        },
        409,
      );
    }

    if (!scan.report) {
      return c.json({ error: "报告为空" }, 404);
    }

    return c.json({
      scanId: scan.id,
      projectId: scan.projectId,
      ...scan.report,
      createdAt: scan.createdAt,
      completedAt: scan.completedAt,
    });
  })

  // GET /security-scan/surface?scanId=xxx — 获取攻击面分析
  .get("/surface", async (c) => {
    const scanId = c.req.query("scanId");
    if (!scanId) {
      return c.json({ error: "scanId is required" }, 400);
    }

    const scan = await getScanStatus(scanId);

    if (!scan) {
      return c.json({ error: "扫描任务不存在" }, 404);
    }

    // 如果扫描有 projectId，获取攻击面
    if (scan.projectId) {
      try {
        const surfaces = await getAttackSurface(scan.projectId);
        return c.json({
          projectId: scan.projectId,
          attackSurfaces: surfaces ?? [],
          totalVectors: (surfaces ?? []).reduce(
            (sum, s) => sum + (s.vectors?.length ?? 0),
            0,
          ),
        });
      } catch (err) {
        return c.json(
          { error: err instanceof Error ? err.message : "分析失败" },
          500,
        );
      }
    }

    // 扫描记录中的攻击面
    return c.json({
      projectId: null,
      attackSurfaces: scan.attackSurfaces ?? [],
      totalVectors: (scan.attackSurfaces ?? []).reduce(
        (sum: number, s: any) => sum + (s.vectors?.length ?? 0),
        0,
      ),
    });
  });
