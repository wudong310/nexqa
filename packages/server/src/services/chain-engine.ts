/**
 * 测试链执行引擎
 *
 * 按 steps 顺序执行测试用例：
 * - 使用 jsonpath.ts 的 queryJsonPath 从响应中提取变量
 * - 使用 setJsonPath 向下游步骤注入变量
 * - 维护变量池（上游提取的值传递给下游）
 * - continueOnFail 控制失败是否继续
 *
 * 参考设计文档 §3.4
 */

import type {
  Environment,
  Extractor,
  Injector,
  TestCase,
  TestChain,
  TestChainStep,
  TestResult,
} from "@nexqa/shared";
import { v4 as uuid } from "uuid";
import { queryJsonPath, setJsonPath } from "./jsonpath.js";
import { createLogger } from "./logger.js";
import type { VariableContext } from "./variable-engine.js";
import { resolveString, flattenVariables } from "./variable-engine.js";

// ── Types ─────────────────────────────────────────────

export interface ChainStepResult {
  stepId: string;
  caseId: string;
  label: string;
  passed: boolean;
  skipped: boolean;
  skipReason?: string;
  extractedVars: Record<string, unknown>;
  testResult: TestResult | null;
  duration: number;
}

export interface ChainExecutionResult {
  chainId: string;
  chainName: string;
  steps: ChainStepResult[];
  variablePool: Record<string, unknown>;
  passed: boolean;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  duration: number;
}

export interface ChainExecuteOptions {
  chain: TestChain;
  /** 按 caseId 索引的测试用例 */
  testCaseMap: Map<string, TestCase>;
  projectId: string;
  baseURL: string;
  sharedHeaders: Record<string, string>;
  environment: Environment | null;
  /** 执行单个用例的函数（注入变量后的用例） */
  executeFn: (testCase: TestCase) => Promise<TestResult>;
  /** 初始变量（环境变量 + 项目变量） */
  initialVariables?: Record<string, string>;
}

// ── Delay Helper ──────────────────────────────────────

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Extract Variables from Response ───────────────────

export function extractVariables(
  extractors: Extractor[],
  response: TestResult["response"],
): { vars: Record<string, unknown>; errors: string[] } {
  const vars: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const ext of extractors) {
    try {
      let value: unknown;

      switch (ext.source) {
        case "body": {
          if (response?.body !== undefined && response.body !== null) {
            value = queryJsonPath(response.body, ext.expression);
          }
          break;
        }
        case "header": {
          if (response?.headers) {
            // header 名不区分大小写
            const headerName = ext.expression.toLowerCase();
            for (const [key, val] of Object.entries(response.headers)) {
              if (key.toLowerCase() === headerName) {
                value = val;
                break;
              }
            }
          }
          break;
        }
        case "status": {
          value = response?.status;
          break;
        }
      }

      if (value !== undefined) {
        vars[ext.varName] = value;
      } else if (ext.required) {
        errors.push(
          `提取变量 "${ext.varName}" 失败: 表达式 "${ext.expression}" 在 ${ext.source} 中未找到值`,
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : String(err);
      if (ext.required) {
        errors.push(`提取变量 "${ext.varName}" 异常: ${msg}`);
      }
    }
  }

  return { vars, errors };
}

// ── Inject Variables into Request ─────────────────────

export function injectVariables(
  injectors: Injector[],
  testCase: TestCase,
  variablePool: Record<string, unknown>,
): TestCase {
  // 深拷贝 request 以避免修改原始对象
  const request = JSON.parse(JSON.stringify(testCase.request));

  for (const inj of injectors) {
    const value = variablePool[inj.varName];
    if (value === undefined) continue;

    const strValue = typeof value === "string" ? value : JSON.stringify(value);

    switch (inj.target) {
      case "path": {
        // 替换 path 中的 :paramName 或 {{varName}}
        request.path = request.path
          .replace(`:${inj.expression}`, encodeURIComponent(strValue))
          .replace(`{{${inj.varName}}}`, encodeURIComponent(strValue));
        break;
      }
      case "query": {
        request.query = request.query || {};
        request.query[inj.expression] = strValue;
        break;
      }
      case "header": {
        request.headers = request.headers || {};
        request.headers[inj.expression] = strValue;
        break;
      }
      case "body": {
        if (request.body !== undefined && request.body !== null) {
          if (typeof request.body === "object") {
            setJsonPath(request.body, inj.expression, value);
          }
        }
        break;
      }
    }
  }

  return { ...testCase, request };
}

// ── Apply Step Overrides ──────────────────────────────

function applyOverrides(
  testCase: TestCase,
  step: TestChainStep,
): TestCase {
  if (!step.overrides) return testCase;

  const request = { ...testCase.request };

  if (step.overrides.headers) {
    request.headers = { ...request.headers, ...step.overrides.headers };
  }

  if (step.overrides.query) {
    request.query = { ...request.query, ...step.overrides.query };
  }

  return { ...testCase, request };
}

// ── Resolve {{var}} in request using variable pool ────

function resolveVariablePool(
  testCase: TestCase,
  variablePool: Record<string, unknown>,
): TestCase {
  // 将变量池转为 caseVariables 字符串格式
  const caseVariables: Record<string, string> = {};
  for (const [key, value] of Object.entries(variablePool)) {
    caseVariables[key] = typeof value === "string" ? value : JSON.stringify(value);
  }

  const ctx: VariableContext = { caseVariables };
  const request = JSON.parse(JSON.stringify(testCase.request));

  // 解析 path
  request.path = resolveString(request.path, ctx);

  // 解析 headers
  for (const [key, val] of Object.entries(request.headers as Record<string, string>)) {
    request.headers[key] = resolveString(val, ctx);
  }

  // 解析 query
  for (const [key, val] of Object.entries(request.query as Record<string, string>)) {
    request.query[key] = resolveString(val, ctx);
  }

  return { ...testCase, request };
}

// ── Main: Execute Chain ───────────────────────────────

export async function executeChain(
  opts: ChainExecuteOptions,
): Promise<ChainExecutionResult> {
  const log = createLogger("chain-engine");
  const { chain, testCaseMap, executeFn } = opts;

  log.info(`开始执行测试链: ${chain.name} (${chain.steps.length} 步)`);
  const chainStart = Date.now();

  // 初始化变量池
  const variablePool: Record<string, unknown> = {};

  // 注入初始变量（环境变量 + 项目变量）
  if (opts.initialVariables) {
    for (const [key, value] of Object.entries(opts.initialVariables)) {
      variablePool[key] = value;
    }
  }

  // 注入环境变量 (O5: flatten VariableEntry + decrypt secrets)
  if (opts.environment?.variables) {
    const flat = flattenVariables(opts.environment.variables);
    for (const [key, value] of Object.entries(flat)) {
      variablePool[key] = value;
    }
  }

  const stepResults: ChainStepResult[] = [];
  let chainPassed = true;
  let passedSteps = 0;
  let failedSteps = 0;
  let skippedSteps = 0;
  let shouldSkipRemaining = false;

  for (const step of chain.steps) {
    const stepStart = Date.now();

    // 如果需要跳过后续步骤
    if (shouldSkipRemaining) {
      skippedSteps++;
      stepResults.push({
        stepId: step.id,
        caseId: step.caseId,
        label: step.label,
        passed: false,
        skipped: true,
        skipReason: "前置步骤失败",
        extractedVars: {},
        testResult: null,
        duration: 0,
      });
      continue;
    }

    // 查找对应的测试用例
    const originalCase = testCaseMap.get(step.caseId);
    if (!originalCase) {
      log.error(`步骤 "${step.label}" 引用的用例 ${step.caseId} 不存在`);
      failedSteps++;
      chainPassed = false;
      stepResults.push({
        stepId: step.id,
        caseId: step.caseId,
        label: step.label,
        passed: false,
        skipped: true,
        skipReason: `引用的用例 ${step.caseId} 不存在`,
        extractedVars: {},
        testResult: null,
        duration: Date.now() - stepStart,
      });

      if (!chain.config.continueOnFail) {
        shouldSkipRemaining = true;
      }
      continue;
    }

    // 步骤延迟
    if (step.delay > 0) {
      log.info(`步骤 "${step.label}" 等待 ${step.delay}ms`);
      await delay(step.delay);
    }

    // 1. 注入变量到请求
    let testCase = injectVariables(step.injectors, originalCase, variablePool);

    // 2. 应用步骤覆盖
    testCase = applyOverrides(testCase, step);

    // 3. 解析 {{变量}} 模板
    testCase = resolveVariablePool(testCase, variablePool);

    // 4. 执行用例
    log.info(`执行步骤: ${step.label} (${testCase.request.method} ${testCase.request.path})`);

    let testResult: TestResult;
    try {
      testResult = await executeFn(testCase);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`步骤 "${step.label}" 执行异常: ${msg}`);
      failedSteps++;
      chainPassed = false;
      stepResults.push({
        stepId: step.id,
        caseId: step.caseId,
        label: step.label,
        passed: false,
        skipped: false,
        extractedVars: {},
        testResult: null,
        duration: Date.now() - stepStart,
      });

      if (!chain.config.continueOnFail) {
        shouldSkipRemaining = true;
      }
      continue;
    }

    // 5. 提取变量
    const extractedVars: Record<string, unknown> = {};
    if (testResult.passed || chain.config.continueOnFail) {
      const { vars, errors } = extractVariables(
        step.extractors,
        testResult.response,
      );

      // 合并到变量池
      for (const [key, value] of Object.entries(vars)) {
        variablePool[key] = value;
        extractedVars[key] = value;
      }

      if (errors.length > 0) {
        log.warn(`步骤 "${step.label}" 变量提取部分失败:`, errors);
        // required 提取失败视为步骤失败
        if (errors.length > 0) {
          failedSteps++;
          chainPassed = false;
          stepResults.push({
            stepId: step.id,
            caseId: step.caseId,
            label: step.label,
            passed: false,
            skipped: false,
            extractedVars,
            testResult,
            duration: Date.now() - stepStart,
          });

          if (!chain.config.continueOnFail) {
            shouldSkipRemaining = true;
          }
          continue;
        }
      }
    }

    // 记录结果
    if (testResult.passed) {
      passedSteps++;
      log.info(`步骤 "${step.label}" 通过，提取变量: ${Object.keys(extractedVars).join(", ") || "无"}`);
    } else {
      failedSteps++;
      chainPassed = false;
      log.warn(`步骤 "${step.label}" 失败: ${testResult.failReason}`);

      if (!chain.config.continueOnFail) {
        shouldSkipRemaining = true;
      }
    }

    stepResults.push({
      stepId: step.id,
      caseId: step.caseId,
      label: step.label,
      passed: testResult.passed,
      skipped: false,
      extractedVars,
      testResult,
      duration: Date.now() - stepStart,
    });
  }

  const duration = Date.now() - chainStart;
  log.info(
    `测试链 "${chain.name}" 完成: ${passedSteps} 通过, ${failedSteps} 失败, ${skippedSteps} 跳过 (${duration}ms)`,
  );

  return {
    chainId: chain.id,
    chainName: chain.name,
    steps: stepResults,
    variablePool,
    passed: chainPassed,
    totalSteps: chain.steps.length,
    passedSteps,
    failedSteps,
    skippedSteps,
    duration,
  };
}
