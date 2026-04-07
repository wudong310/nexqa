import type {
  BatchRun,
  BatchRunResult,
  Environment,
  FailType,
  Project,
  TestCase,
  TestCaseTags,
  TestResult,
} from "@nexqa/shared";
import { CreateBatchRunSchema } from "@nexqa/shared";
import _Ajv from "ajv";
import _addFormats from "ajv-formats";
import { Hono } from "hono";
import { v4 as uuid } from "uuid";
import { createLogger } from "../services/logger.js";
import { safeFetch } from "../services/safe-fetch.js";
import { storage } from "../services/storage.js";
import {
  resolveRequest,
  type VariableContext,
  flattenVariables,
} from "../services/variable-engine.js";

const COLLECTION = "test-results";
const BATCH_COLLECTION = "batch-runs";
const BATCH_RESULTS_COLLECTION = "batch-run-results";

// CJS interop: ajv / ajv-formats may expose default via .default in ESM
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Ajv = ((_Ajv as any).default ?? _Ajv) as typeof _Ajv.default;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = ((_addFormats as any).default ?? _addFormats) as typeof _addFormats.default;

// Singleton Ajv instance — reused across evaluations for perf
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

/**
 * Normalize tags to TestCaseTags.
 */
function safeTags(tags: TestCaseTags | undefined | null): TestCaseTags {
  if (!tags) {
    return { purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" };
  }
  return tags;
}

interface EvaluationResult {
  passed: boolean;
  failReason: string | null;
  failType: FailType | null;
}

function evaluateResult(
  testCase: TestCase,
  response: { status: number; body: unknown; duration?: number },
): EvaluationResult {
  const expected = testCase.expected;
  const timeout = testCase.request.timeout || 30000;

  // 1. Timeout detection — check if duration reached/exceeded the timeout threshold
  if (response.duration !== undefined && response.duration >= timeout) {
    return {
      passed: false,
      failReason: `Request timed out after ${response.duration}ms (timeout: ${timeout}ms)`,
      failType: "timeout",
    };
  }

  // 2. Auth failure detection — 401/403 when NOT expected
  if (
    (response.status === 401 || response.status === 403) &&
    expected.status !== response.status
  ) {
    return {
      passed: false,
      failReason: `Authentication/authorization failed: received ${response.status}${expected.status !== null ? `, expected ${expected.status}` : ""}`,
      failType: "auth_failure",
    };
  }

  // 3. Status code check
  if (expected.status !== null && response.status !== expected.status) {
    return {
      passed: false,
      failReason: `Expected status ${expected.status}, got ${response.status}`,
      failType: "status_mismatch",
    };
  }

  // 4. Body contains check
  if (expected.bodyContains !== null) {
    const bodyStr =
      typeof response.body === "string"
        ? response.body
        : JSON.stringify(response.body);
    if (!bodyStr.includes(expected.bodyContains)) {
      return {
        passed: false,
        failReason: `Response body does not contain "${expected.bodyContains}"`,
        failType: "body_mismatch",
      };
    }
  }

  // 5. JSON Schema validation (Ajv)
  if (expected.bodySchema !== null && expected.bodySchema !== undefined) {
    try {
      const validate = ajv.compile(expected.bodySchema as object);
      const valid = validate(response.body);
      if (!valid) {
        const errors = validate.errors || [];
        const errorMessages = errors
          .map((e: { instancePath?: string; message?: string }) => `${e.instancePath || "/"} ${e.message}`)
          .join("; ");
        return {
          passed: false,
          failReason: `Schema validation failed: ${errorMessages}`,
          failType: "schema_violation",
        };
      }
    } catch (err) {
      return {
        passed: false,
        failReason: `Invalid JSON Schema: ${err instanceof Error ? err.message : String(err)}`,
        failType: "schema_violation",
      };
    }
  }

  return { passed: true, failReason: null, failType: null };
}

/**
 * Classify a catch-block error into a FailType.
 * Used when the fetch itself throws (network errors, timeouts, DNS failures, etc.)
 */
function classifyRequestError(
  err: unknown,
  timeout: number,
): { failType: FailType; failReason: string } {
  if (!(err instanceof Error)) {
    return {
      failType: "unknown",
      failReason: "Request failed with unknown error",
    };
  }

  const msg = err.message.toLowerCase();
  const name = err.name.toLowerCase();

  // Timeout errors (AbortSignal.timeout, AbortError, or timeout in message)
  if (
    name === "timeouterror" ||
    name === "aborterror" ||
    msg.includes("timed out") ||
    msg.includes("timeout")
  ) {
    return {
      failType: "timeout",
      failReason: `Request timed out (timeout: ${timeout}ms): ${err.message}`,
    };
  }

  // DNS / network errors
  if (
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("enotfound") ||
    msg.includes("enetunreach") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("socket hang up") ||
    msg.includes("epipe")
  ) {
    return {
      failType: "network_error",
      failReason: `Network error: ${err.message}`,
    };
  }

  return {
    failType: "unknown",
    failReason: err.message || "Request failed",
  };
}

// ── Shared execution logic ────────────────────────────

interface ExecuteOptions {
  testCase: TestCase;
  projectId: string;
  baseURL: string;
  sharedHeaders: Record<string, string>;
  variableCtx?: VariableContext;
}

/**
 * Execute a single test case and return the TestResult.
 * Extracted to be reused by both single-exec and batch-exec endpoints.
 */
async function executeTestCase(opts: ExecuteOptions): Promise<TestResult> {
  const { testCase, projectId, baseURL, sharedHeaders, variableCtx } = opts;
  const log = createLogger("test-exec");

  // Apply variable resolution if context provided
  const resolvedRequest = variableCtx
    ? resolveRequest(testCase.request, variableCtx)
    : testCase.request;

  const url = `${baseURL}${resolvedRequest.path}`;
  const queryStr = new URLSearchParams(resolvedRequest.query).toString();
  const fullUrl = queryStr ? `${url}?${queryStr}` : url;

  log.info(`执行测试: ${resolvedRequest.method} ${fullUrl}`, {
    caseId: testCase.id,
    caseName: testCase.name,
  });

  const headers: Record<string, string> = {
    ...sharedHeaders,
    ...resolvedRequest.headers,
  };

  if (resolvedRequest.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const start = Date.now();
  try {
    const res = await safeFetch(fullUrl, {
      method: resolvedRequest.method,
      headers,
      body: resolvedRequest.body
        ? JSON.stringify(resolvedRequest.body)
        : undefined,
      timeout: resolvedRequest.timeout || 30000,
    });

    const duration = Date.now() - start;
    log.info(`响应: ${res.status} ${res.statusText}, 耗时 ${duration}ms`);
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      resHeaders[k] = v;
    });

    let body: unknown;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      body = await res.json();
    } else {
      body = await res.text();
    }

    const { passed, failReason, failType } = evaluateResult(testCase, {
      status: res.status,
      body,
      duration,
    });

    if (passed) {
      log.info(`测试通过: ${testCase.name}`);
    } else {
      log.warn(`测试失败: ${testCase.name}`, failReason);
    }

    const result: TestResult = {
      id: uuid(),
      caseId: testCase.id,
      projectId,
      timestamp: new Date().toISOString(),
      request: {
        method: resolvedRequest.method,
        url: fullUrl,
        headers,
        body: resolvedRequest.body,
      },
      response: {
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
        body,
        duration,
      },
      passed,
      failReason,
      failType,
    };

    return result;
  } catch (err) {
    const duration = Date.now() - start;
    log.error(
      `请求异常: ${testCase.name}`,
      err instanceof Error ? err.message : err,
    );
    const requestTimeout = resolvedRequest.timeout || 30000;
    const { failType, failReason } = classifyRequestError(err, requestTimeout);
    const result: TestResult = {
      id: uuid(),
      caseId: testCase.id,
      projectId,
      timestamp: new Date().toISOString(),
      request: {
        method: resolvedRequest.method,
        url: fullUrl,
        headers,
        body: resolvedRequest.body,
      },
      response: {
        status: 0,
        statusText: "Error",
        headers: {},
        body: err instanceof Error ? err.message : "Unknown error",
        duration,
      },
      passed: false,
      failReason,
      failType,
    };

    return result;
  }
}

/**
 * Build variable context from project, environment and optional case-level variables.
 * Priority: case > env > project > builtins
 * O5: Flattens VariableEntry records and decrypts secrets for execution.
 */
function buildVariableContext(
  env: Environment | null,
  caseVariables?: Record<string, string>,
  project?: Project | null,
): VariableContext {
  return {
    caseVariables: caseVariables || {},
    envVariables: flattenVariables(env?.variables),
    projectVariables: flattenVariables(project?.variables),
  };
}

// ── Routes ────────────────────────────────────────────

export const testExecRoutes = new Hono()
  // POST /api/test/exec — single test case execution (backward compatible)
  .post("/exec", async (c) => {
    const {
      testCase,
      projectId,
      environmentId,
    } = await c.req.json<{
      testCase: TestCase;
      projectId: string;
      environmentId?: string;
    }>();

    // BUG-005: null check — testCase / testCase.request 为空时返回 400
    if (!testCase || !testCase.request) {
      return c.json(
        { error: "testCase and testCase.request are required" },
        400,
      );
    }

    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    const project = await storage.read<Project>("projects", projectId);
    const baseURL = project?.baseURL || "";
    const sharedHeaders = project?.headers || {};

    // Load environment if specified
    let env: Environment | null = null;
    if (environmentId) {
      env = await storage.read<Environment>("environments", environmentId);
    }

    // If environment has baseURL, use it to override project baseURL
    const effectiveBaseURL = env?.baseURL || baseURL;
    const effectiveHeaders = { ...sharedHeaders, ...(env?.headers || {}) };

    const variableCtx = buildVariableContext(env, undefined, project);

    const result = await executeTestCase({
      testCase,
      projectId,
      baseURL: effectiveBaseURL,
      sharedHeaders: effectiveHeaders,
      variableCtx,
    });

    await storage.write(COLLECTION, result.id, result);
    return c.json(result);
  })

  // POST /api/test/exec/batch — batch execution, creates BatchRun + executes all cases
  .post("/exec/batch", async (c) => {
    const log = createLogger("batch-exec", c.req.header("x-trace-id"));
    const body = await c.req.json();
    const input = CreateBatchRunSchema.parse(body);

    // 1. Resolve matched test cases (same logic as batch-runs create)
    const allCases = await storage.list<TestCase>("test-cases");
    let matchedCases = allCases.filter((tc) => tc.endpointId);

    if (input.caseIds && input.caseIds.length > 0) {
      const caseIdSet = new Set(input.caseIds);
      matchedCases = matchedCases.filter((tc) => caseIdSet.has(tc.id));
    }

    if (input.endpointIds && input.endpointIds.length > 0) {
      const endpointIdSet = new Set(input.endpointIds);
      matchedCases = matchedCases.filter((tc) =>
        endpointIdSet.has(tc.endpointId),
      );
    }

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
          if (!tf.strategy.some((s) => tags.strategy.includes(s as never))) {
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

    // 2. Load project and environment
    const project = await storage.read<Project>("projects", input.projectId);
    const baseURL = project?.baseURL || "";
    const sharedHeaders = project?.headers || {};

    let env: Environment | null = null;
    if (input.environmentId) {
      env = await storage.read<Environment>(
        "environments",
        input.environmentId,
      );
    }

    const effectiveBaseURL = env?.baseURL || baseURL;
    const effectiveHeaders = { ...sharedHeaders, ...(env?.headers || {}) };
    const variableCtx = buildVariableContext(env, undefined, project);

    // 3. Create the BatchRun record
    const now = new Date().toISOString();
    const batchRun: BatchRun = {
      id: uuid(),
      projectId: input.projectId,
      name: input.name,
      environmentId: input.environmentId ?? null,
      status: "running",
      totalCases: matchedCases.length,
      passedCases: 0,
      failedCases: 0,
      skippedCases: 0,
      failureBreakdown: {},
      startedAt: now,
      completedAt: null,
      createdAt: now,
    };

    await storage.write(BATCH_COLLECTION, batchRun.id, batchRun);
    log.info(
      `Created batch run: ${batchRun.name} (${matchedCases.length} cases)`,
      { batchRunId: batchRun.id },
    );

    // 4. Execute each test case sequentially
    let passedCount = 0;
    let failedCount = 0;
    const failureBreakdown: Record<string, number> = {};

    for (const tc of matchedCases) {
      const result = await executeTestCase({
        testCase: tc,
        projectId: input.projectId,
        baseURL: effectiveBaseURL,
        sharedHeaders: effectiveHeaders,
        variableCtx,
      });

      // Write test result
      await storage.write(COLLECTION, result.id, result);

      // Write batch-run-result link
      const brResult: BatchRunResult = {
        id: uuid(),
        batchRunId: batchRun.id,
        resultId: result.id,
        caseId: tc.id,
        passed: result.passed,
        failType: result.failType ?? null,
      };
      await storage.write(BATCH_RESULTS_COLLECTION, brResult.id, brResult);

      // Update counters
      if (result.passed) {
        passedCount++;
      } else {
        failedCount++;
        if (result.failType) {
          failureBreakdown[result.failType] =
            (failureBreakdown[result.failType] || 0) + 1;
        }
      }
    }

    // 5. Update BatchRun with final stats
    const completedAt = new Date().toISOString();
    const finalStatus = failedCount > 0 ? "failed" : "completed";

    const updatedBatchRun: BatchRun = {
      ...batchRun,
      status: finalStatus,
      passedCases: passedCount,
      failedCases: failedCount,
      skippedCases: 0,
      failureBreakdown,
      completedAt,
    };

    await storage.write(BATCH_COLLECTION, batchRun.id, updatedBatchRun);
    log.info(
      `Batch run completed: ${passedCount} passed, ${failedCount} failed`,
      { batchRunId: batchRun.id, status: finalStatus },
    );

    return c.json(updatedBatchRun, 201);
  });

export const testResultRoutes = new Hono()
  .get("/", async (c) => {
    const projectId = c.req.query("projectId");
    const caseId = c.req.query("caseId");
    const results = await storage.list<TestResult>(COLLECTION);
    let filtered = results;
    if (projectId) filtered = filtered.filter((r) => r.projectId === projectId);
    if (caseId) filtered = filtered.filter((r) => r.caseId === caseId);
    filtered.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return c.json(filtered);
  });

// Export for testing
export { evaluateResult, classifyRequestError, executeTestCase, buildVariableContext };
export type { EvaluationResult, ExecuteOptions };
