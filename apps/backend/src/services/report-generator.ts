import type {
  ApiEndpoint,
  BatchRun,
  BatchRunResult,
  FailType,
  Purpose,
  TestCase,
  TestCaseTags,
  TestResult,
} from "@nexqa/shared";

import { v4 as uuid } from "uuid";
import { calculateCoverage } from "./coverage-engine.js";
import { storage } from "./storage.js";

// ── Types ─────────────────────────────────────────────

export interface TestReport {
  id: string;
  batchRunId: string;
  projectId: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    passRate: number;
    environment: string | null;
    triggeredBy: string;
    timestamp: string;
  };
  failureAnalysis: {
    byType: Record<string, number>;
    byEndpoint: Record<string, number>;
    byPurpose: Record<string, number>;
    topFailures: {
      caseId: string;
      caseName: string;
      endpoint: string;
      failType: string;
      failReason: string;
    }[];
  };
  coverage: {
    endpoint: number;
    method: number;
    statusCode: number;
  };
  comparison?: {
    previousBatchId: string;
    passRateDelta: number;
    newFailures: string[];
    fixedFailures: string[];
    newCases: number;
  };
  stages: {
    name: string;
    status: string;
    passRate: number;
    total: number;
    passed: number;
    failed: number;
    duration: number;
  }[];
  /** 全部用例详情（用于 JUnit XML 等导出） */
  caseDetails: {
    caseId: string;
    caseName: string;
    endpoint: string;
    passed: boolean;
    duration: number;
    failType?: string;
    failReason?: string;
  }[];
  generatedAt: string;
}

// ── Helpers ───────────────────────────────────────────

function safeTags(tags: TestCaseTags | undefined | null): TestCaseTags {
  if (!tags) {
    return { purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" };
  }
  return tags;
}

// ── Report generation ─────────────────────────────────

export async function generateReport(batchRunId: string): Promise<TestReport> {
  // 1. 加载 BatchRun
  const batchRun = await storage.read<BatchRun>("batch-runs", batchRunId);
  if (!batchRun) throw new Error(`BatchRun not found: ${batchRunId}`);

  const projectId = batchRun.projectId;

  // 2. 加载 BatchRunResult + TestResult
  const allBrResults = await storage.list<BatchRunResult>("batch-run-results");
  const brResults = allBrResults.filter((r) => r.batchRunId === batchRunId);

  const testResults: (TestResult & { _brr: BatchRunResult })[] = [];
  for (const brr of brResults) {
    const tr = await storage.read<TestResult>("test-results", brr.resultId);
    if (tr) testResults.push({ ...tr, _brr: brr });
  }

  // 3. 加载用例信息（用于 caseName、tags）
  const allCases = await storage.list<TestCase>("test-cases");
  const caseMap = new Map(allCases.map((tc) => [tc.id, tc]));

  // 4. 加载接口信息
  const allEndpoints = await storage.list<ApiEndpoint>("api-endpoints");
  const epMap = new Map(allEndpoints.map((ep) => [ep.id, ep]));

  // 5. 统计
  const total = testResults.length;
  const passed = testResults.filter((r) => r.passed).length;
  const failed = testResults.filter((r) => !r.passed).length;
  const skipped = 0; // 当前模型无 skipped 概念
  const totalDuration = testResults.reduce(
    (sum, r) => sum + (r.response?.duration || 0),
    0,
  );
  const passRate = total > 0 ? passed / total : 0;

  // 6. 失败分析
  const byType: Record<string, number> = {};
  const byEndpoint: Record<string, number> = {};
  const byPurpose: Record<string, number> = {};
  const failedResults: {
    caseId: string;
    caseName: string;
    endpoint: string;
    failType: string;
    failReason: string;
  }[] = [];

  for (const r of testResults) {
    if (r.passed) continue;
    // 按类型
    const ft = r.failType || "unknown";
    byType[ft] = (byType[ft] || 0) + 1;
    // 按接口
    const tc = caseMap.get(r.caseId);
    let epKey = "unknown";
    if (tc) {
      const ep = tc.endpointId ? epMap.get(tc.endpointId) : undefined;
      epKey = ep ? `${ep.method} ${ep.path}` : tc.endpointId || "unknown";
      byEndpoint[epKey] = (byEndpoint[epKey] || 0) + 1;
      // 按目的
      const tags = safeTags(tc.tags as TestCaseTags);
      for (const p of tags.purpose) {
        byPurpose[p] = (byPurpose[p] || 0) + 1;
      }
    }
    failedResults.push({
      caseId: r.caseId,
      caseName: tc?.name || r.caseId,
      endpoint: epKey,
      failType: ft,
      failReason: r.failReason || "",
    });
  }

  // 所有失败用例（不再截断，topFailures 名称保留向下兼容）
  const topFailures = failedResults;

  // 构建全部用例详情（含通过+失败）
  const caseDetails = testResults.map((r) => {
    const tc = caseMap.get(r.caseId);
    const ep = tc?.endpointId ? epMap.get(tc.endpointId) : undefined;
    const epKey = ep ? `${ep.method} ${ep.path}` : tc?.endpointId || "unknown";
    return {
      caseId: r.caseId,
      caseName: tc?.name || r.caseId,
      endpoint: epKey,
      passed: r.passed,
      duration: r.response?.duration || 0,
      ...(r.passed ? {} : { failType: r.failType || "unknown", failReason: r.failReason || "" }),
    };
  });

  // 7. 覆盖率
  const coverageResult = await calculateCoverage(projectId);

  // 8. 与上次对比 (§3.6)
  const comparison = await computeComparison(batchRun, brResults);

  // 9. 组装报告
  const report: TestReport = {
    id: uuid(),
    batchRunId,
    projectId,
    summary: {
      total,
      passed,
      failed,
      skipped,
      duration: totalDuration,
      passRate,
      environment: batchRun.environmentId,
      triggeredBy: batchRun.name || "manual",
      timestamp: batchRun.startedAt || batchRun.createdAt,
    },
    failureAnalysis: {
      byType,
      byEndpoint,
      byPurpose,
      topFailures,
    },
    coverage: {
      endpoint: coverageResult.endpointCoverage,
      method: coverageResult.methodCoverage,
      statusCode: coverageResult.statusCodeCoverage,
    },
    comparison: comparison || undefined,
    stages: [], // 当前执行引擎无阶段信息，留空
    caseDetails,
    generatedAt: new Date().toISOString(),
  };

  // 10. 持久化报告
  await storage.write("test-reports", report.id, report);

  return report;
}

// ── 3.6: 与上次对比逻辑 ──────────────────────────────

async function computeComparison(
  currentBatch: BatchRun,
  currentBrResults: BatchRunResult[],
): Promise<TestReport["comparison"] | null> {
  // 找到同项目、同环境的上一次已完成的 BatchRun
  const allBatches = await storage.list<BatchRun>("batch-runs");
  const previousBatches = allBatches
    .filter(
      (b) =>
        b.projectId === currentBatch.projectId &&
        b.id !== currentBatch.id &&
        (b.status === "completed" || b.status === "failed") &&
        b.completedAt,
    )
    .sort(
      (a, b) =>
        new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime(),
    );

  // 如果环境相同优先选同环境，否则选最近的
  let prevBatch = previousBatches.find(
    (b) => b.environmentId === currentBatch.environmentId,
  );
  if (!prevBatch && previousBatches.length > 0) {
    prevBatch = previousBatches[0];
  }
  if (!prevBatch) return null;

  // 加载上次的结果
  const allBrResults = await storage.list<BatchRunResult>("batch-run-results");
  const prevBrResults = allBrResults.filter(
    (r) => r.batchRunId === prevBatch!.id,
  );

  // 构建 caseId → passed 映射
  const prevResultMap = new Map<string, boolean>();
  for (const r of prevBrResults) {
    prevResultMap.set(r.caseId, r.passed);
  }
  const currResultMap = new Map<string, boolean>();
  for (const r of currentBrResults) {
    currResultMap.set(r.caseId, r.passed);
  }

  // 计算 newFailures: 当前失败 + (上次通过 或 上次不存在)
  const newFailures: string[] = [];
  for (const r of currentBrResults) {
    if (!r.passed) {
      const prevPassed = prevResultMap.get(r.caseId);
      if (prevPassed === true || prevPassed === undefined) {
        newFailures.push(r.caseId);
      }
    }
  }

  // 计算 fixedFailures: 当前通过 + 上次失败
  const fixedFailures: string[] = [];
  for (const r of currentBrResults) {
    if (r.passed) {
      const prevPassed = prevResultMap.get(r.caseId);
      if (prevPassed === false) {
        fixedFailures.push(r.caseId);
      }
    }
  }

  // 新增用例数
  const newCases = [...currResultMap.keys()].filter(
    (cid) => !prevResultMap.has(cid),
  ).length;

  // 通过率差值
  const prevTotal = prevBatch.totalCases || 1;
  const prevPassRate = prevBatch.passedCases / prevTotal;
  const currTotal = currentBrResults.length || 1;
  const currPassed = currentBrResults.filter((r) => r.passed).length;
  const currPassRate = currPassed / currTotal;
  const passRateDelta = currPassRate - prevPassRate;

  return {
    previousBatchId: prevBatch.id,
    passRateDelta: Math.round(passRateDelta * 10000) / 10000,
    newFailures,
    fixedFailures,
    newCases,
  };
}

// ── Get existing report ──────────────────────────────

export async function getReport(reportId: string): Promise<TestReport | null> {
  return storage.read<TestReport>("test-reports", reportId);
}

export async function listReports(projectId: string): Promise<TestReport[]> {
  const all = await storage.list<TestReport>("test-reports");
  return all
    .filter((r) => r.projectId === projectId)
    .sort(
      (a, b) =>
        new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
    );
}
