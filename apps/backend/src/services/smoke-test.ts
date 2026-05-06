import type {
  BatchRun,
  BatchRunResult,
  Environment,
  Project,
  Settings,
  TestCase,
  TestCaseTags,
  TestResult,
} from "@nexqa/shared";

import { generateText } from "ai";
import { v4 as uuid } from "uuid";
import { createLlmModel } from "./llm.js";
import { createLogger } from "./logger.js";
import { storage } from "./storage.js";
import { SMOKE_SYSTEM_PROMPT, buildSmokePrompt } from "../prompts/smoke-test.js";

// ── Types ─────────────────────────────────────────────

export interface CorePath {
  name: string;
  type: "auth" | "crud" | "business" | "health";
  endpoints: string[];
  reason: string;
}

export interface SmokeReasoning {
  corePaths: CorePath[];
  selectionCriteria: string;
  excluded: Array<{ endpoint: string; reason: string }>;
}

export interface SmokeTestTask {
  id: string;
  projectId: string;
  status: "analyzing" | "running" | "completed" | "failed";
  batchRunId: string | null;
  reasoning: SmokeReasoning | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

// In-memory task store (tasks are transient)
const smokeTasks = new Map<string, SmokeTestTask>();

// ── Tag helpers ───────────────────────────────────────

function safeTags(tags: TestCaseTags | undefined | null): TestCaseTags {
  if (!tags) {
    return { purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" };
  }
  return tags;
}

// ── Rule-based fallback ───────────────────────────────

interface ApiEndpoint {
  id: string;
  projectId: string;
  method: string;
  path: string;
  summary?: string;
}

function ruleBasedSmokeSelection(
  cases: TestCase[],
  endpoints: ApiEndpoint[],
): { selectedCaseIds: string[]; executionOrder: string[]; reasoning: SmokeReasoning } {
  const selected: string[] = [];
  const corePaths: CorePath[] = [];

  // Helpers
  const casesForEndpoint = (epId: string) =>
    cases.filter((c) => c.endpointId === epId);

  const pickBestCase = (epCases: TestCase[]): TestCase | null => {
    // Prefer P0 + positive + smoke
    const scored = epCases.map((c) => {
      const t = safeTags(c.tags as TestCaseTags);
      let score = 0;
      if (t.priority === "P0") score += 10;
      if (t.priority === "P1") score += 5;
      if (t.strategy.includes("positive")) score += 8;
      if (t.phase.includes("smoke")) score += 6;
      return { c, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.c || null;
  };

  // 1. Health endpoints
  const healthEps = endpoints.filter((ep) =>
    /\/(health|ping|status)/.test(ep.path),
  );
  for (const ep of healthEps) {
    const epCases = casesForEndpoint(ep.id);
    const best = pickBestCase(epCases);
    if (best) {
      selected.push(best.id);
      corePaths.push({
        name: "健康检查",
        type: "health",
        endpoints: [`${ep.method} ${ep.path}`],
        reason: "基础健康检查",
      });
    }
  }

  // 2. Auth endpoints
  const authEps = endpoints.filter((ep) =>
    /\/(login|auth|token|oauth|signin|register)/.test(ep.path),
  );
  if (authEps.length > 0) {
    const authEndpoints: string[] = [];
    for (const ep of authEps) {
      const epCases = casesForEndpoint(ep.id);
      const best = pickBestCase(epCases);
      if (best && !selected.includes(best.id)) {
        selected.push(best.id);
        authEndpoints.push(`${ep.method} ${ep.path}`);
      }
    }
    if (authEndpoints.length > 0) {
      corePaths.push({
        name: "认证链路",
        type: "auth",
        endpoints: authEndpoints,
        reason: "认证是所有业务操作的前提",
      });
    }
  }

  // 3. CRUD resources — find resources with multiple methods
  const resourceMap = new Map<string, ApiEndpoint[]>();
  for (const ep of endpoints) {
    // Normalize path: remove :params and trailing slashes
    const resource = ep.path.replace(/\/:[^/]+/g, "").replace(/\/$/, "");
    const list = resourceMap.get(resource) || [];
    list.push(ep);
    resourceMap.set(resource, list);
  }

  for (const [resource, eps] of resourceMap) {
    const methods = new Set(eps.map((e) => e.method));
    const isCrud =
      (methods.has("GET") || methods.has("POST")) &&
      (methods.has("PUT") || methods.has("PATCH") || methods.has("DELETE"));
    if (!isCrud) continue;

    const crudEndpoints: string[] = [];
    // Prefer order: POST → GET → PUT/PATCH → DELETE
    const methodOrder = ["POST", "GET", "PUT", "PATCH", "DELETE"];
    for (const m of methodOrder) {
      const ep = eps.find((e) => e.method === m);
      if (!ep) continue;
      const epCases = casesForEndpoint(ep.id);
      const best = pickBestCase(epCases);
      if (best && !selected.includes(best.id)) {
        selected.push(best.id);
        crudEndpoints.push(`${ep.method} ${ep.path}`);
      }
    }
    if (crudEndpoints.length > 0) {
      corePaths.push({
        name: `${resource} CRUD`,
        type: "crud",
        endpoints: crudEndpoints,
        reason: `${resource} 有多种 HTTP 方法，是核心资源`,
      });
    }
  }

  // 4. Business endpoints
  const businessEps = endpoints.filter((ep) =>
    /\/(order|payment|transaction|checkout|invoice|subscription)/.test(ep.path) &&
    !selected.some((id) => {
      const c = cases.find((tc) => tc.id === id);
      return c?.endpointId === ep.id;
    }),
  );
  for (const ep of businessEps) {
    const epCases = casesForEndpoint(ep.id);
    const best = pickBestCase(epCases);
    if (best && !selected.includes(best.id)) {
      selected.push(best.id);
    }
  }
  if (businessEps.length > 0) {
    corePaths.push({
      name: "业务流程",
      type: "business",
      endpoints: businessEps.map((ep) => `${ep.method} ${ep.path}`),
      reason: "关键业务接口",
    });
  }

  // Limit to 15 cases max
  const final = selected.slice(0, 15);

  return {
    selectedCaseIds: final,
    executionOrder: final,
    reasoning: {
      corePaths,
      selectionCriteria: `规则引擎: 按 P0 + positive + smoke 标签优先选择，共 ${final.length} 个`,
      excluded: [],
    },
  };
}

// ── LLM-based smoke selection ─────────────────────────

function parseLlmJson(text: string): unknown {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return JSON.parse(cleaned);
}

async function llmSmokeSelection(
  cases: TestCase[],
  endpoints: ApiEndpoint[],
  llmConfig: NonNullable<Settings["llm"]>,
  log: ReturnType<typeof createLogger>,
): Promise<{ selectedCaseIds: string[]; executionOrder: string[]; reasoning: SmokeReasoning }> {
  // Build compact data for LLM
  const compactEndpoints = endpoints.map((ep) => ({
    id: ep.id,
    method: ep.method,
    path: ep.path,
    summary: ep.summary || "",
  }));

  const compactCases = cases.map((c) => {
    const t = safeTags(c.tags as TestCaseTags);
    return {
      caseId: c.id,
      name: c.name,
      endpointId: c.endpointId,
      method: c.request.method,
      path: c.request.path,
      purpose: t.purpose,
      strategy: t.strategy,
      phase: t.phase,
      priority: t.priority,
    };
  });

  const model = createLlmModel(llmConfig);
  const prompt = buildSmokePrompt(compactEndpoints, compactCases);

  log.info(`调用 LLM 生成冒烟方案, ${compactEndpoints.length} 个接口, ${compactCases.length} 个用例`);
  const { text } = await generateText({
    model,
    system: SMOKE_SYSTEM_PROMPT,
    prompt,
    maxRetries: 2,
  });

  const parsed = parseLlmJson(text) as {
    corePaths: CorePath[];
    selectedCases: Array<{ caseId: string; reason: string }>;
    executionOrder: string[];
    excluded: Array<{ endpoint: string; reason: string }>;
    selectionSummary: string;
  };

  // Validate that selected case IDs actually exist
  const caseIdSet = new Set(cases.map((c) => c.id));
  const validCaseIds = (parsed.selectedCases || [])
    .map((s) => s.caseId)
    .filter((id) => caseIdSet.has(id));

  const validOrder = (parsed.executionOrder || []).filter((id) => caseIdSet.has(id));
  // If LLM returned order, use it; otherwise use selection order
  const finalOrder = validOrder.length > 0 ? validOrder : validCaseIds;

  return {
    selectedCaseIds: validCaseIds,
    executionOrder: finalOrder,
    reasoning: {
      corePaths: parsed.corePaths || [],
      selectionCriteria: parsed.selectionSummary || "AI 智能选择",
      excluded: parsed.excluded || [],
    },
  };
}

// ── Import executeTestCase logic ──────────────────────
// We inline a lightweight execution here to avoid circular dependency.
// Reuses safe-fetch and variable-engine directly.

import { safeFetch } from "./safe-fetch.js";
import { resolveRequest, type VariableContext, flattenVariables } from "./variable-engine.js";

async function executeSmokeCase(
  testCase: TestCase,
  projectId: string,
  baseURL: string,
  sharedHeaders: Record<string, string>,
  variableCtx: VariableContext,
): Promise<TestResult> {
  const resolvedRequest = resolveRequest(testCase.request, variableCtx);
  const url = `${baseURL}${resolvedRequest.path}`;
  const queryStr = new URLSearchParams(resolvedRequest.query).toString();
  const fullUrl = queryStr ? `${url}?${queryStr}` : url;

  const headers: Record<string, string> = {
    ...sharedHeaders,
    ...resolvedRequest.headers,
  };
  if (resolvedRequest.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const timeout = resolvedRequest.timeout || 10000; // Smoke: 10s timeout
  const start = Date.now();

  try {
    const res = await safeFetch(fullUrl, {
      method: resolvedRequest.method,
      headers,
      body: resolvedRequest.body ? JSON.stringify(resolvedRequest.body) : undefined,
      timeout,
    });

    const duration = Date.now() - start;
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { resHeaders[k] = v; });

    let body: unknown;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      body = await res.json();
    } else {
      body = await res.text();
    }

    // Simple pass/fail: check expected status
    const expected = testCase.expected;
    let passed = true;
    let failReason: string | null = null;
    let failType: string | null = null;

    if (expected.status !== null && res.status !== expected.status) {
      passed = false;
      failReason = `Expected status ${expected.status}, got ${res.status}`;
      failType = "status_mismatch";
    }

    return {
      id: uuid(),
      caseId: testCase.id,
      projectId,
      timestamp: new Date().toISOString(),
      request: { method: resolvedRequest.method, url: fullUrl, headers, body: resolvedRequest.body },
      response: { status: res.status, statusText: res.statusText, headers: resHeaders, body, duration },
      passed,
      failReason,
      failType: failType as TestResult["failType"],
    };
  } catch (err) {
    const duration = Date.now() - start;
    const msg = err instanceof Error ? err.message : "Unknown error";
    const isTimeout = msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("abort");

    return {
      id: uuid(),
      caseId: testCase.id,
      projectId,
      timestamp: new Date().toISOString(),
      request: { method: resolvedRequest.method, url: fullUrl, headers, body: resolvedRequest.body },
      response: { status: 0, statusText: "Error", headers: {}, body: msg, duration },
      passed: false,
      failReason: msg,
      failType: isTimeout ? "timeout" : "network_error",
    };
  }
}

// ── Public API ────────────────────────────────────────

export function getSmokeTask(taskId: string): SmokeTestTask | null {
  return smokeTasks.get(taskId) || null;
}

/**
 * Generate a smoke test plan using AI or rules.
 * Returns the plan (selectedCaseIds + reasoning) without executing.
 */
export async function generateSmokePlan(
  projectId: string,
): Promise<{ selectedCaseIds: string[]; executionOrder: string[]; reasoning: SmokeReasoning }> {
  const log = createLogger("smoke-test");

  // Load project endpoints and cases
  const allEndpoints = await storage.list<ApiEndpoint>("api-endpoints");
  const projectEndpoints = allEndpoints.filter((ep) => ep.projectId === projectId);

  const allCases = await storage.list<TestCase>("test-cases");
  const endpointIds = new Set(projectEndpoints.map((ep) => ep.id));
  const projectCases = allCases.filter((tc) => tc.endpointId != null && endpointIds.has(tc.endpointId));

  if (projectCases.length === 0) {
    return {
      selectedCaseIds: [],
      executionOrder: [],
      reasoning: {
        corePaths: [],
        selectionCriteria: "项目暂无测试用例",
        excluded: [],
      },
    };
  }

  const llmConfig = await getLlmConfig();

  if (llmConfig) {
    try {
      return await llmSmokeSelection(projectCases, projectEndpoints, llmConfig, log);
    } catch (err) {
      log.warn(`LLM 冒烟选择失败，降级: ${err instanceof Error ? err.message : err}`);
      return ruleBasedSmokeSelection(projectCases, projectEndpoints);
    }
  }

  log.info("未配置 LLM，使用规则引擎选择冒烟用例");
  return ruleBasedSmokeSelection(projectCases, projectEndpoints);
}

async function getLlmConfig(): Promise<Settings["llm"] | null> {
  const raw = await storage.readRaw("settings.json");
  if (!raw) return null;
  const settings = JSON.parse(raw) as Settings;
  return settings.llm || null;
}

/**
 * Execute a smoke test: generate plan + execute sequentially.
 * Runs in background, returns task ID immediately.
 */
export async function executeSmoke(
  projectId: string,
  environmentId?: string | null,
): Promise<SmokeTestTask> {
  const log = createLogger("smoke-test");
  const taskId = uuid();

  const task: SmokeTestTask = {
    id: taskId,
    projectId,
    status: "analyzing",
    batchRunId: null,
    reasoning: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  smokeTasks.set(taskId, task);

  // Run in background (non-blocking)
  executeSmokeBackground(task, projectId, environmentId || null, log).catch((err) => {
    task.status = "failed";
    task.error = err instanceof Error ? err.message : String(err);
    task.updatedAt = new Date().toISOString();
  });

  return task;
}

async function executeSmokeBackground(
  task: SmokeTestTask,
  projectId: string,
  environmentId: string | null,
  log: ReturnType<typeof createLogger>,
): Promise<void> {
  // 1. Generate plan
  const plan = await generateSmokePlan(projectId);
  task.reasoning = plan.reasoning;
  task.updatedAt = new Date().toISOString();

  if (plan.selectedCaseIds.length === 0) {
    task.status = "completed";
    task.updatedAt = new Date().toISOString();
    log.info("冒烟测试: 无可用用例");
    return;
  }

  // 2. Load project & environment
  const project = await storage.read<Project>("projects", projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  let env: Environment | null = null;
  const envId = environmentId || project.activeEnvironmentId || null;
  if (envId) {
    env = await storage.read<Environment>("environments", envId);
  }

  const effectiveBaseURL = env?.baseURL || project.baseURL;
  const effectiveHeaders = { ...project.headers, ...(env?.headers || {}) };
  const variableCtx: VariableContext = {
    caseVariables: {},
    envVariables: flattenVariables(env?.variables),
    projectVariables: flattenVariables(project.variables),
  };

  // 3. Create BatchRun
  const now = new Date().toISOString();
  const batchRun: BatchRun = {
    id: uuid(),
    projectId,
    name: `自动冒烟 - ${new Date().toLocaleString("zh-CN")}`,
    environmentId: envId,
    status: "running",
    totalCases: plan.selectedCaseIds.length,
    passedCases: 0,
    failedCases: 0,
    skippedCases: 0,
    failureBreakdown: {},
    startedAt: now,
    completedAt: null,
    createdAt: now,
  };
  await storage.write("batch-runs", batchRun.id, batchRun);

  task.batchRunId = batchRun.id;
  task.status = "running";
  task.updatedAt = new Date().toISOString();

  // 4. Load test cases in execution order
  const caseMap = new Map<string, TestCase>();
  for (const caseId of plan.executionOrder) {
    const tc = await storage.read<TestCase>("test-cases", caseId);
    if (tc) caseMap.set(caseId, tc);
  }

  // 5. Execute sequentially (smoke: no concurrency, no retry)
  let passedCount = 0;
  let failedCount = 0;
  const failureBreakdown: Record<string, number> = {};

  for (const caseId of plan.executionOrder) {
    const tc = caseMap.get(caseId);
    if (!tc) continue;

    const result = await executeSmokeCase(
      tc,
      projectId,
      effectiveBaseURL,
      effectiveHeaders,
      variableCtx,
    );

    await storage.write("test-results", result.id, result);

    const brResult: BatchRunResult = {
      id: uuid(),
      batchRunId: batchRun.id,
      resultId: result.id,
      caseId: tc.id,
      passed: result.passed,
      failType: result.failType ?? null,
    };
    await storage.write("batch-run-results", brResult.id, brResult);

    if (result.passed) {
      passedCount++;
    } else {
      failedCount++;
      if (result.failType) {
        failureBreakdown[result.failType] = (failureBreakdown[result.failType] || 0) + 1;
      }
    }
  }

  // 6. Finalize
  const completedAt = new Date().toISOString();
  const updatedBatchRun: BatchRun = {
    ...batchRun,
    status: failedCount > 0 ? "failed" : "completed",
    passedCases: passedCount,
    failedCases: failedCount,
    failureBreakdown,
    completedAt,
  };
  await storage.write("batch-runs", batchRun.id, updatedBatchRun);

  // Store smoke reasoning alongside batch run
  await storage.write("smoke-reasoning", batchRun.id, {
    batchRunId: batchRun.id,
    ...plan.reasoning,
  });

  task.status = "completed";
  task.updatedAt = new Date().toISOString();

  log.info(`冒烟完成: ${passedCount}/${plan.executionOrder.length} 通过`);

  // 7. If failures and LLM available, auto-trigger analysis
  if (failedCount > 0) {
    try {
      const { analyzeBatchRun } = await import("./ai-analysis.js");
      await analyzeBatchRun(batchRun.id);
      log.info("冒烟失败后自动触发 AI 分析");
    } catch (err) {
      log.warn(`自动分析失败: ${err instanceof Error ? err.message : err}`);
    }
  }
}
