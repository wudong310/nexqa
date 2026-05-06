/**
 * Project-scoped regression & api-diff routes
 *
 * 前端调用路径以 /projects/... 为前缀，
 * 此文件将这些路径适配到已有的 regression 路由逻辑。
 *
 * 前端调用:
 *   POST /projects/api-diff                              → 上传新 spec（body: projectId）
 *   GET  /projects/api-diff/impact?diffId=xxx            → 获取影响分析
 *   POST /projects/api-diff/analyze-impact               → 触发影响分析（body: projectId + diffId）
 *   POST /projects/api-diff/generate-regression          → 从 diff 生成回归方案（body: projectId + diffId）
 *   GET  /projects/regression/detail?regressionId=xxx    → 获取回归方案
 *   POST /projects/regression/execute                    → 执行回归方案（body: projectId + regressionId）
 */

import type { Settings, TestCase, BatchRun } from "@nexqa/shared";
import { Hono } from "hono";
import { v4 as uuid } from "uuid";
import { generateText } from "ai";
import {
  diffOpenApiSpecs,
  parseOpenApiSpec,
  type ApiDiffResult,
} from "../services/api-diff-service.js";
import {
  analyzeImpact,
  type ImpactAnalysisResult,
} from "../services/impact-analyzer.js";
import { createLlmModel } from "../services/llm.js";
import { storage } from "../services/storage.js";

// ── Collections (same as regression.ts) ───────────────
const DOC_VERSIONS = "api-doc-versions";
const DIFFS = "api-diffs";
const REGRESSIONS = "regression-results";

// ── Types (re-used from regression.ts) ────────────────

interface ApiDocVersion {
  id: string;
  projectId: string;
  version: string;
  specContent: string;
  endpointCount: number;
  createdAt: string;
  source: "manual" | "webhook" | "git";
}

interface StoredDiff {
  id: string;
  projectId: string;
  oldVersionId: string;
  newVersionId: string;
  diff: ApiDiffResult;
  impact?: ImpactAnalysisResult;
  createdAt: string;
}

interface RegressionPlan {
  id: string;
  projectId: string;
  diffId: string;
  changeSummary: ApiDiffResult["summary"];
  confidence: number;
  directCaseIds: string[];
  indirectChainIds: string[];
  smokeCaseIds: string[];
  newCaseIds: string[];
  adjustments: Array<{
    caseId: string;
    description: string;
    field: string;
    before: unknown;
    after: unknown;
  }>;
  execution: {
    environmentId?: string;
    concurrency: number;
    retryOnFail: number;
    timeoutMs: number;
    minPassRate: number;
  };
  reasoning: string;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────

function countEndpoints(spec: any): number {
  let count = 0;
  const paths = spec.paths || {};
  for (const methods of Object.values(paths as Record<string, any>)) {
    if (!methods || typeof methods !== "object") continue;
    for (const method of Object.keys(methods)) {
      if (["get", "post", "put", "patch", "delete", "head", "options"].includes(method.toLowerCase())) {
        count++;
      }
    }
  }
  return count;
}

async function getLatestDocVersion(projectId: string): Promise<ApiDocVersion | null> {
  const all = await storage.list<ApiDocVersion>(DOC_VERSIONS);
  const projectDocs = all
    .filter((d) => d.projectId === projectId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return projectDocs[0] || null;
}

// ── Routes ────────────────────────────────────────────

export const projectRegressionRoutes = new Hono()
  // POST /projects/api-diff — 上传新 spec 进行 diff 分析（body: projectId）
  .post("/api-diff", async (c) => {
    const body = await c.req.json();
    const projectId = body.projectId;
    if (!projectId) return c.json({ error: "projectId is required" }, 400);

    const {
      specContent,
      newSpecContent = specContent, // 兼容两种字段名
      oldSpecContent,
      version,
      source = "manual",
    } = body;

    if (!newSpecContent) return c.json({ error: "specContent is required" }, 400);

    // Parse new spec
    let newSpec: any;
    try {
      newSpec = parseOpenApiSpec(newSpecContent);
    } catch (err) {
      return c.json({ error: `Invalid new spec: ${(err as Error).message}` }, 400);
    }

    // Get or parse old spec
    let oldSpec: any;
    let oldVersionId: string | null = null;

    if (oldSpecContent) {
      try {
        oldSpec = parseOpenApiSpec(oldSpecContent);
      } catch (err) {
        return c.json({ error: `Invalid old spec: ${(err as Error).message}` }, 400);
      }
    } else {
      const latestDoc = await getLatestDocVersion(projectId);
      if (!latestDoc) {
        const newDocVersion: ApiDocVersion = {
          id: uuid(),
          projectId,
          version: version || "v1.0",
          specContent: newSpecContent,
          endpointCount: countEndpoints(newSpec),
          createdAt: new Date().toISOString(),
          source,
        };
        await storage.write(DOC_VERSIONS, newDocVersion.id, newDocVersion);
        return c.json({
          message: "First version stored. Upload another version to generate diff.",
          versionId: newDocVersion.id,
          endpointCount: newDocVersion.endpointCount,
        });
      }
      oldVersionId = latestDoc.id;
      oldSpec = parseOpenApiSpec(latestDoc.specContent);
    }

    // Store new version
    const newDocVersion: ApiDocVersion = {
      id: uuid(),
      projectId,
      version: version || `v${Date.now()}`,
      specContent: newSpecContent,
      endpointCount: countEndpoints(newSpec),
      createdAt: new Date().toISOString(),
      source,
    };
    await storage.write(DOC_VERSIONS, newDocVersion.id, newDocVersion);

    // Run diff
    const diff = diffOpenApiSpecs(oldSpec, newSpec);

    // Run impact analysis
    const impact = await analyzeImpact(projectId, diff);

    // Store diff result
    const storedDiff: StoredDiff = {
      id: uuid(),
      projectId,
      oldVersionId: oldVersionId || "inline",
      newVersionId: newDocVersion.id,
      diff,
      impact,
      createdAt: new Date().toISOString(),
    };
    await storage.write(DIFFS, storedDiff.id, storedDiff);

    return c.json({
      id: storedDiff.id,
      diffId: storedDiff.id,
      summary: diff.summary,
      added: diff.added,
      removed: diff.removed,
      modified: diff.modified,
      impact,
    });
  })

  // GET /projects/api-diff/impact?diffId=xxx — 获取影响分析
  .get("/api-diff/impact", async (c) => {
    const diffId = c.req.query("diffId");
    if (!diffId) return c.json({ error: "diffId is required" }, 400);

    const diffData = await storage.read<StoredDiff>(DIFFS, diffId);
    if (!diffData) return c.json({ error: "Diff result not found" }, 404);
    return c.json({
      diffId: diffData.id,
      diff: diffData.diff,
      impact: diffData.impact || null,
    });
  })

  // POST /projects/api-diff/analyze-impact — 触发影响分析（body: projectId + diffId）
  .post("/api-diff/analyze-impact", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { projectId, diffId } = body as { projectId?: string; diffId?: string };
    if (!projectId) return c.json({ error: "projectId is required" }, 400);
    if (!diffId) return c.json({ error: "diffId is required" }, 400);

    const diffData = await storage.read<StoredDiff>(DIFFS, diffId);
    if (!diffData) return c.json({ error: "Diff result not found" }, 404);

    // Re-run impact analysis
    const impact = await analyzeImpact(projectId, diffData.diff);
    diffData.impact = impact;
    await storage.write(DIFFS, diffId, diffData);

    return c.json({
      diffId: diffData.id,
      diff: diffData.diff,
      impact,
    });
  })

  // POST /projects/api-diff/generate-regression — 从 diff 生成回归方案（body: projectId + diffId）
  .post("/api-diff/generate-regression", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { projectId, diffId, environmentId, autoAdjust = true } = body as {
      projectId?: string;
      diffId?: string;
      environmentId?: string;
      autoAdjust?: boolean;
    };
    if (!projectId) return c.json({ error: "projectId is required" }, 400);
    if (!diffId) return c.json({ error: "diffId is required" }, 400);

    const diffData = await storage.read<StoredDiff>(DIFFS, diffId);
    if (!diffData) return c.json({ error: "Diff result not found" }, 404);

    const impact = diffData.impact;
    if (!impact) return c.json({ error: "No impact analysis available" }, 400);

    // Collect case IDs
    const directCaseIds = impact.directCases.map((c) => c.caseId);
    const indirectChainIds = impact.indirectChains.map((c) => c.chainId);

    // Get smoke cases for the project
    const allCases = await storage.list<TestCase>("test-cases");
    const allEndpoints = await storage.list<{ id: string; projectId: string }>("api-endpoints");
    const projectEndpointIds = new Set(
      allEndpoints.filter((e) => e.projectId === projectId).map((e) => e.id),
    );
    const projectCases = allCases.filter((tc) => tc.endpointId != null && projectEndpointIds.has(tc.endpointId));
    const smokeCaseIds = projectCases
      .filter((tc) => {
        const tags = tc.tags as any;
        return tags?.phase?.includes?.("smoke");
      })
      .map((tc) => tc.id);

    // Build adjustments for autoFixable cases
    const adjustments: RegressionPlan["adjustments"] = [];
    if (autoAdjust) {
      for (const ic of impact.directCases.filter((c) => c.autoFixable)) {
        adjustments.push({
          caseId: ic.caseId,
          description: ic.aiSuggestion,
          field: "request.body",
          before: null,
          after: null,
        });
      }
    }

    // Try LLM-enhanced plan generation
    let reasoning = "基于规则引擎生成的回归方案";
    let confidence = 0.75;

    const settings = await storage.read<Settings>("", "settings");
    if (settings?.llm) {
      try {
        const model = createLlmModel(settings.llm);
        const result = await generateText({
          model,
          messages: [
            {
              role: "user",
              content: `你是 NexQA 回归方案生成引擎。基于以下影响分析生成回归方案推理。

变更摘要: 新增 ${diffData.diff.summary.added} 修改 ${diffData.diff.summary.modified} 删除 ${diffData.diff.summary.removed} Breaking ${diffData.diff.summary.breaking}
直接受影响用例: ${directCaseIds.length} 个
间接受影响测试链: ${indirectChainIds.length} 个
冒烟用例: ${smokeCaseIds.length} 个

用一段话总结回归方案的逻辑和覆盖范围，并给出 0-1 之间的置信度。
输出 JSON: { "reasoning": "...", "confidence": 0.85 }`,
            },
          ],
          temperature: 0.3,
        });

        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          reasoning = parsed.reasoning || reasoning;
          confidence = parsed.confidence ?? confidence;
        }
      } catch {
        // LLM failed, use rule-based defaults
      }
    }

    const plan: RegressionPlan = {
      id: uuid(),
      projectId,
      diffId,
      changeSummary: diffData.diff.summary,
      confidence,
      directCaseIds,
      indirectChainIds,
      smokeCaseIds,
      newCaseIds: [],
      adjustments,
      execution: {
        environmentId,
        concurrency: 1,
        retryOnFail: 1,
        timeoutMs: 30000,
        minPassRate: 0.95,
      },
      reasoning,
      createdAt: new Date().toISOString(),
    };

    await storage.write(REGRESSIONS, plan.id, plan);
    return c.json({ regressionId: plan.id, ...plan });
  })

  // GET /projects/regression/detail?regressionId=xxx — 获取回归方案
  .get("/regression/detail", async (c) => {
    const regressionId = c.req.query("regressionId");
    if (!regressionId) return c.json({ error: "regressionId is required" }, 400);

    const plan = await storage.read<RegressionPlan>(REGRESSIONS, regressionId);
    if (!plan) return c.json({ error: "Regression plan not found" }, 404);
    return c.json(plan);
  })

  // POST /projects/regression/execute — 执行回归方案（body: projectId + regressionId）
  .post("/regression/execute", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { projectId, regressionId, environmentId } = body as {
      projectId?: string;
      regressionId?: string;
      environmentId?: string;
    };
    if (!projectId) return c.json({ error: "projectId is required" }, 400);
    if (!regressionId) return c.json({ error: "regressionId is required" }, 400);

    const plan = await storage.read<RegressionPlan>(REGRESSIONS, regressionId);
    if (!plan) return c.json({ error: "Regression plan not found" }, 404);

    // Collect all case IDs for the batch run
    const allCaseIds = new Set([...plan.directCaseIds, ...plan.smokeCaseIds]);
    const caseIds = [...allCaseIds];

    if (caseIds.length === 0) {
      return c.json({ error: "No test cases to execute in this regression plan" }, 400);
    }

    const envId = environmentId || plan.execution.environmentId || null;

    // Create a batch run
    const now = new Date().toISOString();
    const batchRun: BatchRun = {
      id: uuid(),
      projectId,
      name: `AI 自动回归 — ${plan.changeSummary.modified} 修改 + ${plan.changeSummary.added} 新增`,
      environmentId: envId,
      status: "pending",
      totalCases: caseIds.length,
      passedCases: 0,
      failedCases: 0,
      skippedCases: 0,
      failureBreakdown: {},
      startedAt: null,
      completedAt: null,
      createdAt: now,
    };

    await storage.write("batch-runs", batchRun.id, batchRun);

    return c.json(
      {
        batchRunId: batchRun.id,
        regressionId: plan.id,
        caseCount: caseIds.length,
        status: "pending",
        message: `回归方案已创建，包含 ${caseIds.length} 个用例待执行`,
      },
      202,
    );
  });
