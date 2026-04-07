/**
 * 阶段门禁执行引擎
 *
 * 按阶段（smoke → regression → full → targeted）依次执行：
 * - 每个阶段结束后检查通过率，达标才进入下一阶段
 * - 门禁失败时停止后续阶段
 *
 * 参考设计文档 §3.5
 */

import type {
  BatchRun,
  BatchRunResult,
  Environment,
  TestCase,
  TestCaseTags,
  TestResult,
} from "@nexqa/shared";

import { v4 as uuid } from "uuid";
import { runWithConcurrency } from "./concurrency.js";
import { withResultRetry, type RetryOptions } from "./concurrency.js";
import { createLogger } from "./logger.js";
import { checkSkip, type SkipContext, type SkipReason } from "./skip-logic.js";
import { storage } from "./storage.js";

// ── Stage Configuration ───────────────────────────────

export interface StageConfig {
  name: string;
  filter: {
    phase?: string[];
    purpose?: string[];
    strategy?: string[];
    priority?: string[];
  };
  gate: {
    enabled: boolean;
    minPassRate: number;
    action: "abort" | "continue";
  };
  concurrency: number;
}

export const DEFAULT_STAGES: StageConfig[] = [
  {
    name: "冒烟测试",
    filter: { phase: ["smoke"], priority: ["P0"] },
    gate: { enabled: true, minPassRate: 1.0, action: "abort" },
    concurrency: 1,
  },
  {
    name: "功能测试",
    filter: {
      purpose: ["functional", "auth", "data-integrity", "idempotent"],
    },
    gate: { enabled: true, minPassRate: 0.95, action: "continue" },
    concurrency: 3,
  },
  {
    name: "安全与边界测试",
    filter: {
      purpose: ["security"],
      strategy: ["boundary", "destructive"],
    },
    gate: { enabled: false, minPassRate: 0.9, action: "continue" },
    concurrency: 3,
  },
  {
    name: "性能基准",
    filter: { purpose: ["performance"] },
    gate: { enabled: false, minPassRate: 0, action: "continue" },
    concurrency: 1,
  },
];

// ── Stage Execution Result ────────────────────────────

export interface StageResult {
  name: string;
  status: "passed" | "failed" | "skipped" | "gate_failed";
  passRate: number;
  gateResult?: "passed" | "failed";
  resultIds: string[];
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration: number;
}

export interface StageGateRunResult {
  stages: StageResult[];
  allResults: TestResult[];
  aborted: boolean;
  abortReason?: string;
}

// ── Core Types ────────────────────────────────────────

export interface StageGateOptions {
  /** 所有候选测试用例 */
  testCases: TestCase[];
  /** 项目 ID */
  projectId: string;
  /** baseURL */
  baseURL: string;
  /** 共享 headers */
  sharedHeaders: Record<string, string>;
  /** 环境 */
  environment: Environment | null;
  /** 阶段配置（默认使用 DEFAULT_STAGES） */
  stages?: StageConfig[];
  /** 是否启用阶段门禁（false 则所有用例一起跑） */
  enableStages: boolean;
  /** 门禁失败是否中止后续阶段 */
  stopOnGateFail: boolean;
  /** 全局并发数（不启用阶段时使用） */
  concurrency: number;
  /** 重试配置 */
  retryOptions: RetryOptions;
  /** 执行单个用例的函数 */
  executeFn: (testCase: TestCase) => Promise<TestResult>;
  /** 进度回调 */
  onProgress?: (stage: string, completed: number, total: number) => void;
  /** 跳过上下文 */
  skipCtx?: Partial<SkipContext>;
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

// ── Filter: Match test cases to stage ─────────────────

export function matchCasesToStage(
  cases: TestCase[],
  filter: StageConfig["filter"],
): TestCase[] {
  return cases.filter((tc) => {
    const tags = safeTags(tc.tags as TestCaseTags);

    // 使用 OR 逻辑：匹配 filter 中任一维度即可进入该阶段
    // 如果 filter 的某个维度为空/未定义，则不参与过滤
    let matched = false;
    let hasFilter = false;

    if (filter.phase && filter.phase.length > 0) {
      hasFilter = true;
      if (filter.phase.some((p) => tags.phase.includes(p as never))) {
        matched = true;
      }
    }

    if (filter.purpose && filter.purpose.length > 0) {
      hasFilter = true;
      if (filter.purpose.some((p) => tags.purpose.includes(p as never))) {
        matched = true;
      }
    }

    if (filter.strategy && filter.strategy.length > 0) {
      hasFilter = true;
      if (filter.strategy.some((s) => tags.strategy.includes(s as never))) {
        matched = true;
      }
    }

    if (filter.priority && filter.priority.length > 0) {
      hasFilter = true;
      if (filter.priority.includes(tags.priority)) {
        matched = true;
      }
    }

    // 如果没有任何 filter 条件，默认不匹配
    return hasFilter ? matched : false;
  });
}

// ── Execute Stage ─────────────────────────────────────

async function executeStage(
  stage: StageConfig,
  cases: TestCase[],
  opts: StageGateOptions,
  failedCaseIds: Set<string>,
): Promise<StageResult> {
  const log = createLogger("stage-gate");
  const stageStart = Date.now();

  if (cases.length === 0) {
    return {
      name: stage.name,
      status: "skipped",
      passRate: 1,
      resultIds: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      duration: 0,
    };
  }

  log.info(`开始阶段: ${stage.name} (${cases.length} 个用例, 并发 ${stage.concurrency})`);

  const resultIds: string[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  // 构建跳过上下文
  const skipCtx: SkipContext = {
    ...opts.skipCtx,
    failedCaseIds,
  };

  // 构建任务列表
  const tasks = cases.map((tc) => async () => {
    // 检查跳过
    const skipResult = checkSkip(tc, skipCtx);
    if (skipResult.skipped) {
      skipped++;
      log.info(`跳过用例: ${tc.name} — ${skipResult.skipReason}: ${skipResult.skipDetail || ""}`);
      // 创建跳过结果
      const skipTestResult: TestResult = {
        id: uuid(),
        caseId: tc.id,
        projectId: opts.projectId,
        timestamp: new Date().toISOString(),
        request: {
          method: tc.request.method,
          url: `${opts.baseURL}${tc.request.path}`,
          headers: {},
          body: tc.request.body,
        },
        response: {
          status: 0,
          statusText: "Skipped",
          headers: {},
          body: null,
          duration: 0,
        },
        passed: false,
        failReason: `Skipped: ${skipResult.skipReason}${skipResult.skipDetail ? ` — ${skipResult.skipDetail}` : ""}`,
        failType: null,
      };
      resultIds.push(skipTestResult.id);
      return skipTestResult;
    }

    // 使用 withResultRetry 执行
    const { result, retryCount } = await withResultRetry(
      () => opts.executeFn(tc),
      opts.retryOptions,
      (r) => (r.passed ? null : r.failType || "unknown"),
    );

    if (result.passed) {
      passed++;
    } else {
      failed++;
      failedCaseIds.add(tc.id);
    }

    resultIds.push(result.id);
    opts.onProgress?.(stage.name, passed + failed + skipped, cases.length);
    return result;
  });

  // 并发执行
  await runWithConcurrency(tasks, { limit: stage.concurrency });

  const duration = Date.now() - stageStart;
  const executed = passed + failed;
  const passRate = executed > 0 ? passed / executed : 1;

  // 检查门禁
  let gateResult: "passed" | "failed" | undefined;
  let status: StageResult["status"] = "passed";

  if (stage.gate.enabled) {
    if (passRate >= stage.gate.minPassRate) {
      gateResult = "passed";
      log.info(`阶段 ${stage.name} 门禁通过: ${(passRate * 100).toFixed(1)}% >= ${(stage.gate.minPassRate * 100).toFixed(1)}%`);
    } else {
      gateResult = "failed";
      status = "gate_failed";
      log.warn(`阶段 ${stage.name} 门禁失败: ${(passRate * 100).toFixed(1)}% < ${(stage.gate.minPassRate * 100).toFixed(1)}%`);
    }
  } else {
    status = failed > 0 ? "failed" : "passed";
  }

  return {
    name: stage.name,
    status,
    passRate,
    gateResult,
    resultIds,
    passed,
    failed,
    skipped,
    total: cases.length,
    duration,
  };
}

// ── Main: Run Stages Pipeline ─────────────────────────

export async function runStageGatePipeline(
  opts: StageGateOptions,
): Promise<StageGateRunResult> {
  const log = createLogger("stage-gate");
  const stages = opts.stages || DEFAULT_STAGES;
  const allResults: TestResult[] = [];
  const stageResults: StageResult[] = [];
  const failedCaseIds = new Set<string>(opts.skipCtx?.failedCaseIds || []);
  let aborted = false;
  let abortReason: string | undefined;

  if (!opts.enableStages) {
    // 不启用阶段门禁 — 所有用例一次性执行
    log.info(`阶段门禁未启用，直接执行全部 ${opts.testCases.length} 个用例`);
    const singleStage: StageConfig = {
      name: "全部用例",
      filter: {},
      gate: { enabled: false, minPassRate: 0, action: "continue" },
      concurrency: opts.concurrency,
    };

    const result = await executeStage(
      singleStage,
      opts.testCases,
      opts,
      failedCaseIds,
    );
    stageResults.push(result);

    return { stages: stageResults, allResults, aborted: false };
  }

  // 阶段门禁启用 — 按阶段依次执行
  // 追踪已在前面阶段执行过的用例 ID，避免重复执行
  const executedCaseIds = new Set<string>();

  for (const stage of stages) {
    if (aborted) {
      // 被上一个阶段门禁中止，后续阶段标记为 skipped
      stageResults.push({
        name: stage.name,
        status: "skipped",
        passRate: 0,
        resultIds: [],
        passed: 0,
        failed: 0,
        skipped: 0,
        total: 0,
        duration: 0,
      });
      continue;
    }

    // 筛选匹配当前阶段的用例（排除已执行的）
    const stageCases = matchCasesToStage(opts.testCases, stage.filter).filter(
      (tc) => !executedCaseIds.has(tc.id),
    );

    const result = await executeStage(stage, stageCases, opts, failedCaseIds);
    stageResults.push(result);

    // 标记为已执行
    for (const tc of stageCases) {
      executedCaseIds.add(tc.id);
    }

    // 检查是否需要中止
    if (
      result.status === "gate_failed" &&
      stage.gate.action === "abort" &&
      opts.stopOnGateFail
    ) {
      aborted = true;
      abortReason = `阶段 "${stage.name}" 门禁失败（通过率 ${(result.passRate * 100).toFixed(1)}% < ${(stage.gate.minPassRate * 100).toFixed(1)}%），中止后续阶段`;
      log.error(abortReason);
    }
  }

  return { stages: stageResults, allResults, aborted, abortReason };
}
