import type {
  BatchRun,
  BatchRunResult,
  FailType,
  Settings,
  TestCase,
  TestResult,
} from "@nexqa/shared";
import { generateText } from "ai";
import { v4 as uuid } from "uuid";
import { createLlmModel } from "./llm.js";
import { createLogger } from "./logger.js";
import { storage } from "./storage.js";
import {
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisPrompt,
  buildSingleCaseAnalysisPrompt,
} from "../prompts/ai-analysis.js";

// ── Types ─────────────────────────────────────────────

export type RootCauseCategory =
  | "api-bug"
  | "api-change"
  | "env-issue"
  | "auth-expired"
  | "test-case-error"
  | "test-data-issue"
  | "flaky"
  | "dependency-fail"
  | "timeout"
  | "unknown";

export interface FailureSuggestion {
  target: "api" | "test-case" | "environment" | "test-chain";
  summary: string;
  details: string;
  autoFix?: AutoFixPatch | null;
}

export interface AutoFixPatch {
  description: string;
  caseId: string;
  field: string;
  before: unknown;
  after: unknown;
}

export interface FailureItem {
  resultId: string;
  caseId: string;
  caseName: string;
  endpoint: string;
  rootCause: RootCauseCategory;
  confidence: number;
  analysis: string;
  suggestion: FailureSuggestion;
}

export interface FailureGroup {
  category: RootCauseCategory;
  count: number;
  items: FailureItem[];
  groupSuggestion: string;
}

export interface ActionItem {
  priority: "P0" | "P1" | "P2";
  action: string;
  target: "开发" | "测试" | "运维";
  relatedResultIds: string[];
}

export interface FailureAnalysis {
  id: string;
  batchRunId: string;
  projectId: string;
  overallAssessment: {
    status: "healthy" | "has-issues" | "critical";
    summary: string;
  };
  groups: FailureGroup[];
  actionItems: ActionItem[];
  createdAt: string;
}

export interface SingleCaseAnalysis {
  id: string;
  resultId: string;
  projectId: string;
  rootCause: RootCauseCategory;
  confidence: number;
  analysis: string;
  suggestion: FailureSuggestion;
  createdAt: string;
}

// ── Rule-based fallback ───────────────────────────────

const FAIL_TYPE_TO_ROOT_CAUSE: Record<string, { rootCause: RootCauseCategory; confidence: number }> = {
  network_error: { rootCause: "env-issue", confidence: 0.95 },
  timeout: { rootCause: "timeout", confidence: 0.85 },
  auth_failure: { rootCause: "auth-expired", confidence: 0.90 },
  schema_violation: { rootCause: "api-change", confidence: 0.70 },
  chain_dependency: { rootCause: "dependency-fail", confidence: 0.95 },
  variable_error: { rootCause: "test-case-error", confidence: 0.80 },
};

function ruleBasedClassify(
  failType: FailType | null,
  status: number,
): { rootCause: RootCauseCategory; confidence: number } {
  if (failType && FAIL_TYPE_TO_ROOT_CAUSE[failType]) {
    return FAIL_TYPE_TO_ROOT_CAUSE[failType];
  }
  if (failType === "status_mismatch" && status === 500) {
    return { rootCause: "api-bug", confidence: 0.80 };
  }
  if (failType === "status_mismatch" && status === 404) {
    return { rootCause: "test-data-issue", confidence: 0.65 };
  }
  if (failType === "body_mismatch") {
    return { rootCause: "api-change", confidence: 0.60 };
  }
  return { rootCause: "unknown", confidence: 0.50 };
}

function buildRuleBasedSuggestion(
  rootCause: RootCauseCategory,
): { target: FailureSuggestion["target"]; summary: string } {
  switch (rootCause) {
    case "api-bug":
      return { target: "api", summary: "API 返回异常状态码，建议开发检查" };
    case "api-change":
      return { target: "test-case", summary: "API 响应结构可能已变更，建议更新用例" };
    case "env-issue":
      return { target: "environment", summary: "网络/环境问题，检查目标服务是否可达" };
    case "auth-expired":
      return { target: "environment", summary: "认证失败，检查 Token 是否过期" };
    case "test-case-error":
      return { target: "test-case", summary: "用例配置可能有误，检查变量和参数" };
    case "test-data-issue":
      return { target: "test-case", summary: "测试数据问题，检查资源是否存在" };
    case "timeout":
      return { target: "api", summary: "请求超时，检查目标服务性能" };
    case "dependency-fail":
      return { target: "test-chain", summary: "上游依赖失败，先修复依赖用例" };
    default:
      return { target: "api", summary: "无法确定根因，需人工排查" };
  }
}

function ruleBasedAnalyzeItem(
  result: TestResult,
  testCase: TestCase | null,
): FailureItem {
  const { rootCause, confidence } = ruleBasedClassify(
    result.failType,
    result.response.status,
  );
  const suggestion = buildRuleBasedSuggestion(rootCause);

  return {
    resultId: result.id,
    caseId: result.caseId,
    caseName: testCase?.name || "未知用例",
    endpoint: `${result.request.method} ${new URL(result.request.url).pathname}`,
    rootCause,
    confidence,
    analysis: result.failReason || "执行失败",
    suggestion: {
      target: suggestion.target,
      summary: suggestion.summary,
      details: result.failReason || "未知原因",
    },
  };
}

// ── LLM-based analysis ───────────────────────────────

function parseLlmJson(text: string): unknown {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return JSON.parse(cleaned);
}

async function getLlmConfig(): Promise<Settings["llm"] | null> {
  const raw = await storage.readRaw("settings.json");
  if (!raw) return null;
  const settings = JSON.parse(raw) as Settings;
  return settings.llm || null;
}

// ── Public API ────────────────────────────────────────

const ANALYSIS_COLLECTION = "failure-analyses";

/**
 * Analyze all failed results in a batch run.
 * Uses LLM if configured, otherwise falls back to rule-based analysis.
 */
export async function analyzeBatchRun(batchRunId: string, force = false): Promise<FailureAnalysis> {
  const log = createLogger("ai-analysis");

  // Check cache (unless force)
  if (!force) {
    const cached = await findAnalysisByBatchId(batchRunId);
    if (cached) {
      log.info(`使用缓存的分析结果: ${cached.id}`);
      return cached;
    }
  }

  // Load batch run
  const batchRun = await storage.read<BatchRun>("batch-runs", batchRunId);
  if (!batchRun) {
    throw new Error(`Batch run ${batchRunId} not found`);
  }

  // Load failed results
  const allBrResults = await storage.list<BatchRunResult>("batch-run-results");
  const failedBrResults = allBrResults.filter(
    (r) => r.batchRunId === batchRunId && !r.passed,
  );

  if (failedBrResults.length === 0) {
    const analysis: FailureAnalysis = {
      id: uuid(),
      batchRunId,
      projectId: batchRun.projectId,
      overallAssessment: { status: "healthy", summary: "所有用例均通过" },
      groups: [],
      actionItems: [],
      createdAt: new Date().toISOString(),
    };
    await storage.write(ANALYSIS_COLLECTION, analysis.id, analysis);
    return analysis;
  }

  // Load full test results and corresponding test cases
  const failedResults: TestResult[] = [];
  const caseMap = new Map<string, TestCase>();

  for (const brr of failedBrResults) {
    const result = await storage.read<TestResult>("test-results", brr.resultId);
    if (result) {
      failedResults.push(result);
      if (!caseMap.has(result.caseId)) {
        const tc = await storage.read<TestCase>("test-cases", result.caseId);
        if (tc) caseMap.set(result.caseId, tc);
      }
    }
  }

  log.info(`分析 ${failedResults.length} 个失败用例`);

  // Try LLM analysis
  const llmConfig = await getLlmConfig();
  let items: FailureItem[];

  if (llmConfig) {
    try {
      items = await llmAnalyzeBatch(failedResults, caseMap, llmConfig, log);
    } catch (err) {
      log.warn(`LLM 分析失败，降级到规则引擎: ${err instanceof Error ? err.message : err}`);
      items = failedResults.map((r) => ruleBasedAnalyzeItem(r, caseMap.get(r.caseId) || null));
    }
  } else {
    log.info("未配置 LLM，使用规则引擎分析");
    items = failedResults.map((r) => ruleBasedAnalyzeItem(r, caseMap.get(r.caseId) || null));
  }

  // Group by rootCause
  const groupMap = new Map<RootCauseCategory, FailureItem[]>();
  for (const item of items) {
    const list = groupMap.get(item.rootCause) || [];
    list.push(item);
    groupMap.set(item.rootCause, list);
  }

  const groups: FailureGroup[] = [];
  for (const [category, groupItems] of groupMap) {
    const suggestion = buildRuleBasedSuggestion(category);
    groups.push({
      category,
      count: groupItems.length,
      items: groupItems,
      groupSuggestion: suggestion.summary,
    });
  }

  // Generate action items
  const actionItems = buildActionItems(items);

  // Determine overall status
  const apiBugCount = items.filter((i) => i.rootCause === "api-bug").length;
  const status = apiBugCount > 3 ? "critical" : items.length > 0 ? "has-issues" : "healthy";

  const analysis: FailureAnalysis = {
    id: uuid(),
    batchRunId,
    projectId: batchRun.projectId,
    overallAssessment: {
      status,
      summary: `${failedResults.length} 个失败: ${groups.map((g) => `${g.count} 个 ${g.category}`).join("、")}`,
    },
    groups,
    actionItems,
    createdAt: new Date().toISOString(),
  };

  await storage.write(ANALYSIS_COLLECTION, analysis.id, analysis);
  log.info(`分析完成: ${analysis.id}`);
  return analysis;
}

/**
 * Analyze a single failed test result.
 */
export async function analyzeSingleResult(resultId: string): Promise<SingleCaseAnalysis | { skipped: true; reason: string }> {
  const log = createLogger("ai-analysis");

  const result = await storage.read<TestResult>("test-results", resultId);
  if (!result) throw new Error(`Test result ${resultId} not found`);

  // Skip analysis for passed test cases — no actionable failure to analyze
  if (result.passed) {
    log.info(`用例已通过，跳过分析: ${resultId}`);
    return { skipped: true, reason: "用例已通过，无需分析" };
  }

  const testCase = await storage.read<TestCase>("test-cases", result.caseId);

  const llmConfig = await getLlmConfig();
  let rootCause: RootCauseCategory;
  let confidence: number;
  let analysisText: string;
  let suggestion: FailureSuggestion;

  if (llmConfig && !result.passed) {
    try {
      const llmResult = await llmAnalyzeSingle(result, testCase, llmConfig, log);
      rootCause = llmResult.rootCause;
      confidence = llmResult.confidence;
      analysisText = llmResult.analysis;
      suggestion = llmResult.suggestion;
    } catch (err) {
      log.warn(`LLM 单例分析失败，降级: ${err instanceof Error ? err.message : err}`);
      const item = ruleBasedAnalyzeItem(result, testCase || null);
      rootCause = item.rootCause;
      confidence = item.confidence;
      analysisText = item.analysis;
      suggestion = item.suggestion;
    }
  } else {
    const item = ruleBasedAnalyzeItem(result, testCase || null);
    rootCause = item.rootCause;
    confidence = item.confidence;
    analysisText = item.analysis;
    suggestion = item.suggestion;
  }

  const analysis: SingleCaseAnalysis = {
    id: uuid(),
    resultId,
    projectId: result.projectId,
    rootCause,
    confidence,
    analysis: analysisText,
    suggestion,
    createdAt: new Date().toISOString(),
  };

  // Cache to file
  await storage.write("case-analyses", analysis.id, analysis);
  return analysis;
}

// ── Internal helpers ──────────────────────────────────

async function findAnalysisByBatchId(batchRunId: string): Promise<FailureAnalysis | null> {
  const all = await storage.list<FailureAnalysis>(ANALYSIS_COLLECTION);
  return all.find((a) => a.batchRunId === batchRunId) || null;
}

async function llmAnalyzeBatch(
  failedResults: TestResult[],
  caseMap: Map<string, TestCase>,
  llmConfig: NonNullable<Settings["llm"]>,
  log: ReturnType<typeof createLogger>,
): Promise<FailureItem[]> {
  // Build compact input for LLM
  const compactResults = failedResults.map((r) => {
    const tc = caseMap.get(r.caseId);
    let urlPath: string;
    try {
      urlPath = new URL(r.request.url).pathname;
    } catch {
      urlPath = r.request.url;
    }
    return {
      resultId: r.id,
      caseName: tc?.name || "未知",
      endpoint: `${r.request.method} ${urlPath}`,
      expected: tc?.expected || null,
      actual: {
        status: r.response.status,
        body: typeof r.response.body === "string"
          ? r.response.body.slice(0, 500)
          : JSON.stringify(r.response.body).slice(0, 500),
        duration: r.response.duration,
      },
      failType: r.failType,
      failReason: r.failReason,
    };
  });

  const model = createLlmModel(llmConfig);
  const prompt = buildAnalysisPrompt(compactResults);

  log.info(`调用 LLM 分析 ${compactResults.length} 个失败用例`);
  const { text } = await generateText({
    model,
    system: ANALYSIS_SYSTEM_PROMPT,
    prompt,
    maxRetries: 2,
  });

  const parsed = parseLlmJson(text) as {
    analyses: Array<{
      resultId: string;
      rootCause: RootCauseCategory;
      confidence: number;
      analysis: string;
      suggestion: {
        target: string;
        summary: string;
        details: string;
      };
      autoFix?: unknown;
    }>;
  };

  // Map LLM output back to FailureItem[]
  return parsed.analyses.map((a) => {
    const result = failedResults.find((r) => r.id === a.resultId);
    const tc = result ? caseMap.get(result.caseId) : null;
    let urlPath: string;
    try {
      urlPath = result ? new URL(result.request.url).pathname : "";
    } catch {
      urlPath = result?.request.url || "";
    }
    return {
      resultId: a.resultId,
      caseId: result?.caseId || "",
      caseName: tc?.name || "未知",
      endpoint: result ? `${result.request.method} ${urlPath}` : "",
      rootCause: a.rootCause || "unknown",
      confidence: a.confidence || 0.5,
      analysis: a.analysis || "",
      suggestion: {
        target: (a.suggestion?.target as FailureSuggestion["target"]) || "api",
        summary: a.suggestion?.summary || "",
        details: a.suggestion?.details || "",
      },
    };
  });
}

async function llmAnalyzeSingle(
  result: TestResult,
  testCase: TestCase | null,
  llmConfig: NonNullable<Settings["llm"]>,
  log: ReturnType<typeof createLogger>,
): Promise<{
  rootCause: RootCauseCategory;
  confidence: number;
  analysis: string;
  suggestion: FailureSuggestion;
}> {
  let urlPath: string;
  try {
    urlPath = new URL(result.request.url).pathname;
  } catch {
    urlPath = result.request.url;
  }
  const compactResult = {
    resultId: result.id,
    caseName: testCase?.name || "未知",
    endpoint: `${result.request.method} ${urlPath}`,
    expected: testCase?.expected || null,
    actual: {
      status: result.response.status,
      body: typeof result.response.body === "string"
        ? result.response.body.slice(0, 1000)
        : JSON.stringify(result.response.body).slice(0, 1000),
      duration: result.response.duration,
    },
    failType: result.failType,
    failReason: result.failReason,
  };

  const model = createLlmModel(llmConfig);
  const prompt = buildSingleCaseAnalysisPrompt(compactResult);

  log.info(`调用 LLM 分析单个用例: ${testCase?.name || result.id}`);
  const { text } = await generateText({
    model,
    system: ANALYSIS_SYSTEM_PROMPT,
    prompt,
    maxRetries: 2,
  });

  const parsed = parseLlmJson(text) as {
    rootCause: RootCauseCategory;
    confidence: number;
    analysis: string;
    suggestion: {
      target: string;
      summary: string;
      details: string;
    };
  };

  return {
    rootCause: parsed.rootCause || "unknown",
    confidence: parsed.confidence || 0.5,
    analysis: parsed.analysis || "",
    suggestion: {
      target: (parsed.suggestion?.target as FailureSuggestion["target"]) || "api",
      summary: parsed.suggestion?.summary || "",
      details: parsed.suggestion?.details || "",
    },
  };
}

function buildActionItems(items: FailureItem[]): ActionItem[] {
  const actionItems: ActionItem[] = [];

  const apiBugs = items.filter((i) => i.rootCause === "api-bug");
  if (apiBugs.length > 0) {
    actionItems.push({
      priority: "P0",
      action: `修复 ${apiBugs.length} 个 API Bug（${apiBugs.map((i) => i.endpoint).join("、")})`,
      target: "开发",
      relatedResultIds: apiBugs.map((i) => i.resultId),
    });
  }

  const envIssues = items.filter((i) => ["env-issue", "timeout"].includes(i.rootCause));
  if (envIssues.length > 0) {
    actionItems.push({
      priority: "P1",
      action: `检查环境/网络问题（${envIssues.length} 个用例受影响）`,
      target: "运维",
      relatedResultIds: envIssues.map((i) => i.resultId),
    });
  }

  const caseIssues = items.filter((i) =>
    ["api-change", "test-case-error", "test-data-issue"].includes(i.rootCause),
  );
  if (caseIssues.length > 0) {
    actionItems.push({
      priority: "P2",
      action: `更新 ${caseIssues.length} 个测试用例`,
      target: "测试",
      relatedResultIds: caseIssues.map((i) => i.resultId),
    });
  }

  return actionItems;
}
