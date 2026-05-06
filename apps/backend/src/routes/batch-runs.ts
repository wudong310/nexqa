import type {
  BatchRun,
  BatchRunResult,
  TestCase,
  TestCaseTags,
  TestResult,
} from "@nexqa/shared";
import { CreateBatchRunSchema } from "@nexqa/shared";
import { Hono } from "hono";
import { v4 as uuid } from "uuid";
import { createLogger } from "../services/logger.js";
import { storage } from "../services/storage.js";

const COLLECTION = "batch-runs";
const RESULTS_COLLECTION = "batch-run-results";

/**
 * Normalize tags to TestCaseTags.
 */
function safeTags(tags: TestCaseTags | undefined | null): TestCaseTags {
  if (!tags) {
    return { purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" };
  }
  return tags;
}

export const batchRunRoutes = new Hono()
  // POST /api/batch-runs — create a new batch run
  .post("/", async (c) => {
    const log = createLogger("batch-runs", c.req.header("x-trace-id"));
    const body = await c.req.json();
    const input = CreateBatchRunSchema.parse(body);

    // Determine how many test cases match the filter
    const allCases = await storage.list<TestCase>("test-cases");
    let matchedCases = allCases.filter(
      (tc) => tc.endpointId != null // must belong to an endpoint
    );

    // Filter by project — test cases don't have projectId directly,
    // so we need to go through endpoints if endpointIds are given.
    // For now, if caseIds are specified, use those directly.
    if (input.caseIds && input.caseIds.length > 0) {
      const caseIdSet = new Set(input.caseIds);
      matchedCases = matchedCases.filter((tc) => caseIdSet.has(tc.id));
    }

    if (input.endpointIds && input.endpointIds.length > 0) {
      const endpointIdSet = new Set(input.endpointIds);
      matchedCases = matchedCases.filter((tc) =>
        tc.endpointId != null && endpointIdSet.has(tc.endpointId),
      );
    }

    // Tag filter
    if (input.tagFilter) {
      const tf = input.tagFilter;
      matchedCases = matchedCases.filter((tc) => {
        const tags = safeTags(tc.tags as TestCaseTags);
        if (tf.purpose && tf.purpose.length > 0) {
          if (!tf.purpose.some((p) => tags.purpose.includes(p as never))) {
            return false;
          }
        }
        if (tf.strategy && tf.strategy.length > 0) {
          if (
            !tf.strategy.some((s) => tags.strategy.includes(s as never))
          ) {
            return false;
          }
        }
        if (tf.phase && tf.phase.length > 0) {
          if (!tf.phase.some((p) => tags.phase.includes(p as never))) {
            return false;
          }
        }
        if (tf.priority) {
          if (tags.priority !== tf.priority) return false;
        }
        return true;
      });
    }

    const now = new Date().toISOString();
    const batchRun: BatchRun = {
      id: uuid(),
      projectId: input.projectId,
      name: input.name,
      environmentId: input.environmentId ?? null,
      status: "pending",
      totalCases: matchedCases.length,
      passedCases: 0,
      failedCases: 0,
      skippedCases: 0,
      failureBreakdown: {},
      startedAt: null,
      completedAt: null,
      createdAt: now,
    };

    await storage.write(COLLECTION, batchRun.id, batchRun);
    log.info(`Created batch run: ${batchRun.name} (${matchedCases.length} cases)`, {
      batchRunId: batchRun.id,
    });

    return c.json(batchRun, 201);
  })
  // GET /api/batch-runs?projectId=xxx — list batch runs (paginated, newest first)
  .get("/", async (c) => {
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return c.json({ error: "projectId query parameter is required" }, 400);
    }

    const page = Math.max(1, Number(c.req.query("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize")) || 20));

    const all = await storage.list<BatchRun>(COLLECTION);
    const filtered = all
      .filter((r) => r.projectId === projectId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize);
    const items = filtered.slice((page - 1) * pageSize, page * pageSize);

    return c.json({
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    });
  })
  // GET /api/batch-runs/detail — batch run detail
  .get("/detail", async (c) => {
    const id = c.req.query("id");
    if (!id) return c.json({ error: "id is required" }, 400);
    const batchRun = await storage.read<BatchRun>(COLLECTION, id);
    if (!batchRun) {
      return c.json({ error: "Batch run not found" }, 404);
    }

    // Include result summaries
    const allResults = await storage.list<BatchRunResult>(RESULTS_COLLECTION);
    const batchResults = allResults.filter((r) => r.batchRunId === id);

    return c.json({
      ...batchRun,
      results: batchResults,
    });
  })
  // GET /api/batch-runs/results — list test results for a batch run
  .get("/results", async (c) => {
    const id = c.req.query("id");
    if (!id) return c.json({ error: "id is required" }, 400);

    // Verify batch run exists
    const batchRun = await storage.read<BatchRun>(COLLECTION, id);
    if (!batchRun) {
      return c.json({ error: "Batch run not found" }, 404);
    }

    // Get batch-run-result links
    const allBrResults = await storage.list<BatchRunResult>(RESULTS_COLLECTION);
    const brResults = allBrResults.filter((r) => r.batchRunId === id);

    // Fetch the full TestResult for each link
    const results: (TestResult & { batchRunResultId: string })[] = [];
    for (const brr of brResults) {
      const testResult = await storage.read<TestResult>(
        "test-results",
        brr.resultId,
      );
      if (testResult) {
        results.push({ ...testResult, batchRunResultId: brr.id });
      }
    }

    // Sort by timestamp descending
    results.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return c.json(results);
  });
