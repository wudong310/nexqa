/**
 * 测试方案执行引擎
 *
 * 实现 POST /nexqa/api/projects/:projectId/plans/:planId/run 的实际逻辑：
 * - 根据方案的 selection 筛选匹配的测试用例
 * - 使用 runWithConcurrency 控制并发
 * - 使用 withResultRetry 做失败重试
 * - 执行结果关联 BatchRun
 * - stopOnFailure 和 passThreshold 逻辑
 *
 * 参考设计文档 §3.3
 */

import type {
  BatchRun,
  BatchRunResult,
  Environment,
  Project,
  TestCase,
  TestCaseTags,
  TestChain,
  TestPlan,
  TestResult,
} from "@nexqa/shared";

import { v4 as uuid } from "uuid";
import { executeChain, type ChainExecutionResult } from "./chain-engine.js";
import { type RetryOptions } from "./concurrency.js";
import { createLogger } from "./logger.js";
import {
  runStageGatePipeline,
  type StageGateRunResult,
} from "./stage-gate-engine.js";
import { storage } from "./storage.js";
import { flattenVariables } from "./variable-engine.js";

// ── Types ─────────────────────────────────────────────

export interface PlanExecutionResult {
  batchRunId: string;
  status: BatchRun["status"];
  stageResults: StageGateRunResult["stages"];
  chainResults: ChainExecutionResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
    duration: number;
  };
  criteriaResult: {
    met: boolean;
    passRateMet: boolean;
    p0FailsMet: boolean;
    p1FailsMet: boolean;
    details: string[];
  };
}

export interface PlanExecuteOptions {
  plan: TestPlan;
  projectId: string;
  /** 执行单个用例的函数（已绑定 baseURL + headers） */
  executeFn: (testCase: TestCase) => Promise<TestResult>;
  /** 进度回调 */
  onProgress?: (stage: string, completed: number, total: number) => void;
}

// ── Helper: Safe Tags ─────────────────────────────────

function safeTags(
  tags: TestCaseTags | undefined | null,
): TestCaseTags {
  if (!tags) {
    return {
      purpose: ["functional"],
      strategy: ["positive"],
      phase: ["full"],
      priority: "P1",
    };
  }
  return tags;
}

// ── Filter: Match test cases to plan selection ────────

export function filterCasesBySelection(
  allCases: TestCase[],
  selection: TestPlan["selection"],
): TestCase[] {
  let matched = allCases;

  // 1. 如果指定了 caseIds，最高优先级直接使用
  if (selection.caseIds && selection.caseIds.length > 0) {
    const idSet = new Set(selection.caseIds);
    return matched.filter((tc) => idSet.has(tc.id));
  }

  // 2. 按 endpointIds 筛选
  if (selection.endpointIds && selection.endpointIds.length > 0) {
    const idSet = new Set(selection.endpointIds);
    matched = matched.filter((tc) => tc.endpointId != null && idSet.has(tc.endpointId));
  }

  // 3. 按 tags 筛选（多条件取交集）
  if (selection.tags) {
    const tf = selection.tags;
    matched = matched.filter((tc) => {
      const tags = safeTags(tc.tags as TestCaseTags);

      if (tf.purpose && tf.purpose.length > 0) {
        if (!tf.purpose.some((p) => tags.purpose.includes(p))) {
          return false;
        }
      }
      if (tf.strategy && tf.strategy.length > 0) {
        if (!tf.strategy.some((s) => tags.strategy.includes(s))) {
          return false;
        }
      }
      if (tf.phase && tf.phase.length > 0) {
        if (!tf.phase.some((p) => tags.phase.includes(p))) {
          return false;
        }
      }
      if (tf.priority && tf.priority.length > 0) {
        if (!tf.priority.includes(tags.priority)) {
          return false;
        }
      }

      return true;
    });
  }

  return matched;
}

// ── Main: Execute Plan ────────────────────────────────

export async function executePlan(
  opts: PlanExecuteOptions,
): Promise<PlanExecutionResult> {
  const log = createLogger("plan-engine");
  const { plan, projectId, executeFn, onProgress } = opts;
  const planStart = Date.now();

  log.info(`开始执行测试方案: ${plan.name}`);

  // 1. 加载所有测试用例
  const allCases = await storage.list<TestCase>("test-cases");
  // 过滤当前项目的用例（通过 endpoint 关联）
  const projectCases = allCases.filter((tc) => tc.endpointId != null);

  // 2. 根据 selection 筛选用例
  const matchedCases = filterCasesBySelection(projectCases, plan.selection);
  log.info(`筛选匹配用例: ${matchedCases.length}/${projectCases.length}`);

  // 3. 加载环境
  let environment: Environment | null = null;
  if (plan.execution.environmentId) {
    environment = await storage.read<Environment>(
      "environments",
      plan.execution.environmentId,
    );
  }

  // 4. 创建 BatchRun
  const now = new Date().toISOString();
  const batchRun: BatchRun = {
    id: uuid(),
    projectId,
    name: `${plan.name} — ${now}`,
    environmentId: plan.execution.environmentId ?? null,
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
  await storage.write("batch-runs", batchRun.id, batchRun);
  log.info(`创建 BatchRun: ${batchRun.id}`);

  // 5. 构建重试配置
  const retryOptions: RetryOptions = {
    maxRetries: plan.execution.retryOnFail,
    delayMs: 1000,
  };

  // 6. 执行测试链（如果 selection 中包含 chainIds）
  const chainResults: ChainExecutionResult[] = [];
  if (plan.selection.chainIds && plan.selection.chainIds.length > 0) {
    log.info(`执行 ${plan.selection.chainIds.length} 条测试链`);

    // 构建 testCaseMap
    const testCaseMap = new Map<string, TestCase>();
    for (const tc of allCases) {
      testCaseMap.set(tc.id, tc);
    }

    for (const chainId of plan.selection.chainIds) {
      const chain = await storage.read<TestChain>("test-chains", chainId);
      if (!chain) {
        log.warn(`测试链 ${chainId} 不存在，跳过`);
        continue;
      }

      const project = await storage.read<Project>("projects", projectId);
      const chainResult = await executeChain({
        chain,
        testCaseMap,
        projectId,
        baseURL: environment?.baseURL || project?.baseURL || "",
        sharedHeaders: {
          ...(project?.headers || {}),
          ...(environment?.headers || {}),
        },
        environment,
        executeFn,
        initialVariables: flattenVariables(project?.variables || {}),
      });

      chainResults.push(chainResult);

      // 将链执行结果关联到 BatchRun
      for (const step of chainResult.steps) {
        if (step.testResult) {
          await storage.write("test-results", step.testResult.id, step.testResult);
          const brResult: BatchRunResult = {
            id: uuid(),
            batchRunId: batchRun.id,
            resultId: step.testResult.id,
            caseId: step.caseId,
            passed: step.passed,
            failType: step.testResult.failType ?? null,
          };
          await storage.write("batch-run-results", brResult.id, brResult);
        }
      }
    }
  }

  // 7. 使用阶段门禁执行引擎执行用例
  const stageGateResult = await runStageGatePipeline({
    testCases: matchedCases,
    projectId,
    baseURL: environment?.baseURL || "",
    sharedHeaders: environment?.headers || {},
    environment,
    enableStages: plan.execution.stages,
    stopOnGateFail: plan.execution.stopOnGateFail,
    concurrency: plan.execution.concurrency,
    retryOptions,
    executeFn: async (testCase: TestCase) => {
      const result = await executeFn(testCase);

      // 保存结果并关联 BatchRun
      await storage.write("test-results", result.id, result);
      const brResult: BatchRunResult = {
        id: uuid(),
        batchRunId: batchRun.id,
        resultId: result.id,
        caseId: testCase.id,
        passed: result.passed,
        failType: result.failType ?? null,
      };
      await storage.write("batch-run-results", brResult.id, brResult);

      return result;
    },
    onProgress,
  });

  // 8. 汇总统计
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  const failureBreakdown: Record<string, number> = {};

  for (const stage of stageGateResult.stages) {
    totalPassed += stage.passed;
    totalFailed += stage.failed;
    totalSkipped += stage.skipped;
  }

  // 链的结果也计入
  for (const cr of chainResults) {
    totalPassed += cr.passedSteps;
    totalFailed += cr.failedSteps;
    totalSkipped += cr.skippedSteps;
  }

  const totalExecuted = totalPassed + totalFailed;
  const totalAll = totalPassed + totalFailed + totalSkipped;
  const passRate = totalExecuted > 0 ? totalPassed / totalExecuted : 1;
  const duration = Date.now() - planStart;

  // 9. 检查通过标准
  const criteriaDetails: string[] = [];
  const passRateMet = passRate >= plan.criteria.minPassRate;
  if (!passRateMet) {
    criteriaDetails.push(
      `通过率 ${(passRate * 100).toFixed(1)}% < 最低要求 ${(plan.criteria.minPassRate * 100).toFixed(1)}%`,
    );
  }

  // 统计 P0 和 P1 失败数
  let p0Fails = 0;
  let p1Fails = 0;
  // 从 BatchRunResults 统计
  const allBrResults = await storage.list<BatchRunResult>("batch-run-results");
  const batchBrResults = allBrResults.filter((r) => r.batchRunId === batchRun.id && !r.passed);

  for (const brr of batchBrResults) {
    const tc = matchedCases.find((c) => c.id === brr.caseId) || allCases.find((c) => c.id === brr.caseId);
    if (tc) {
      const tags = safeTags(tc.tags as TestCaseTags);
      if (tags.priority === "P0") p0Fails++;
      if (tags.priority === "P1") p1Fails++;

      // 统计 failureBreakdown
      if (brr.failType) {
        failureBreakdown[brr.failType] = (failureBreakdown[brr.failType] || 0) + 1;
      }
    }
  }

  const p0FailsMet = p0Fails <= plan.criteria.maxP0Fails;
  if (!p0FailsMet) {
    criteriaDetails.push(
      `P0 失败 ${p0Fails} 个 > 最大允许 ${plan.criteria.maxP0Fails} 个`,
    );
  }

  const p1FailsMet = p1Fails <= plan.criteria.maxP1Fails;
  if (!p1FailsMet) {
    criteriaDetails.push(
      `P1 失败 ${p1Fails} 个 > 最大允许 ${plan.criteria.maxP1Fails} 个`,
    );
  }

  const criteriaMet = passRateMet && p0FailsMet && p1FailsMet;

  // 10. 更新 BatchRun 最终状态
  let finalStatus: BatchRun["status"];
  if (stageGateResult.aborted) {
    finalStatus = "failed";
  } else if (!criteriaMet || totalFailed > 0) {
    finalStatus = "failed";
  } else {
    finalStatus = "completed";
  }

  const completedAt = new Date().toISOString();
  const updatedBatchRun: BatchRun = {
    ...batchRun,
    status: finalStatus,
    passedCases: totalPassed,
    failedCases: totalFailed,
    skippedCases: totalSkipped,
    failureBreakdown,
    completedAt,
  };
  await storage.write("batch-runs", batchRun.id, updatedBatchRun);

  log.info(
    `方案 "${plan.name}" 执行完成: ${totalPassed} 通过, ${totalFailed} 失败, ${totalSkipped} 跳过 — 通过率 ${(passRate * 100).toFixed(1)}% — 标准${criteriaMet ? "达标" : "未达标"}`,
  );

  return {
    batchRunId: batchRun.id,
    status: finalStatus,
    stageResults: stageGateResult.stages,
    chainResults,
    summary: {
      total: totalAll,
      passed: totalPassed,
      failed: totalFailed,
      skipped: totalSkipped,
      passRate,
      duration,
    },
    criteriaResult: {
      met: criteriaMet,
      passRateMet,
      p0FailsMet,
      p1FailsMet,
      details: criteriaDetails,
    },
  };
}
