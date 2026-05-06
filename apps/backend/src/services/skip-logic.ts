/**
 * 自动跳过逻辑
 *
 * 6 种跳过条件：
 * 1. 缺少环境变量 (missing_variable)
 * 2. 依赖用例失败 (dependency_failed)
 * 3. 标记 disabled (disabled)
 * 4. 不匹配当前阶段 (phase_mismatch)
 * 5. 前置链未通过 (chain_prerequisite_failed)
 * 6. 手动排除 (manually_excluded)
 */

import type { TestCase, TestCaseTags } from "@nexqa/shared";
import { hasUnresolved, resolveString, type VariableContext } from "./variable-engine.js";

export type SkipReason =
  | "missing_variable"
  | "dependency_failed"
  | "disabled"
  | "phase_mismatch"
  | "chain_prerequisite_failed"
  | "manually_excluded";

export interface SkipCheckResult {
  skipped: boolean;
  skipReason: SkipReason | null;
  skipDetail?: string;
}

export interface SkipContext {
  /** 当前执行的阶段 phase，为空则不做阶段过滤 */
  currentPhase?: string;
  /** 已失败的用例 ID 集合（用于依赖检查） */
  failedCaseIds?: Set<string>;
  /** 已失败的测试链 ID 集合 */
  failedChainIds?: Set<string>;
  /** 手动排除的用例 ID 集合 */
  excludedCaseIds?: Set<string>;
  /** 被标记为 disabled 的用例 ID 集合 */
  disabledCaseIds?: Set<string>;
  /** 变量上下文，用于检查未解析变量 */
  variableCtx?: VariableContext;
  /** 用例所属的测试链 ID（如果在链内执行） */
  chainId?: string;
  /** 用例依赖的前置用例 ID 列表 */
  dependsOnCaseIds?: string[];
}

/**
 * 检查单个测试用例是否应被跳过
 *
 * 按优先级依次检查 6 种条件，命中第一个即返回
 */
export function checkSkip(
  testCase: TestCase,
  ctx: SkipContext,
): SkipCheckResult {
  // 1. 手动排除
  if (ctx.excludedCaseIds?.has(testCase.id)) {
    return { skipped: true, skipReason: "manually_excluded" };
  }

  // 2. 标记 disabled
  if (ctx.disabledCaseIds?.has(testCase.id)) {
    return { skipped: true, skipReason: "disabled" };
  }

  // 3. 不匹配当前阶段
  if (ctx.currentPhase) {
    const tags = testCase.tags as TestCaseTags;
    if (tags?.phase && !tags.phase.includes(ctx.currentPhase as never)) {
      return {
        skipped: true,
        skipReason: "phase_mismatch",
        skipDetail: `用例阶段 [${tags.phase.join(",")}] 不匹配当前阶段 ${ctx.currentPhase}`,
      };
    }
  }

  // 4. 依赖用例失败
  if (ctx.dependsOnCaseIds && ctx.failedCaseIds) {
    for (const depId of ctx.dependsOnCaseIds) {
      if (ctx.failedCaseIds.has(depId)) {
        return {
          skipped: true,
          skipReason: "dependency_failed",
          skipDetail: `依赖的用例 ${depId} 已失败`,
        };
      }
    }
  }

  // 5. 前置链未通过
  if (ctx.chainId && ctx.failedChainIds?.has(ctx.chainId)) {
    return {
      skipped: true,
      skipReason: "chain_prerequisite_failed",
      skipDetail: `前置测试链 ${ctx.chainId} 未通过`,
    };
  }

  // 6. 缺少环境变量
  if (ctx.variableCtx) {
    const unresolvedVars = checkUnresolvedVariables(testCase, ctx.variableCtx);
    if (unresolvedVars.length > 0) {
      return {
        skipped: true,
        skipReason: "missing_variable",
        skipDetail: `缺少变量: ${unresolvedVars.join(", ")}`,
      };
    }
  }

  return { skipped: false, skipReason: null };
}

/**
 * 检查测试用例中是否有未解析的变量
 */
function checkUnresolvedVariables(
  testCase: TestCase,
  ctx: VariableContext,
): string[] {
  const unresolved: string[] = [];
  const request = testCase.request;

  // 检查 path
  const resolvedPath = resolveString(request.path, ctx);
  if (hasUnresolved(resolvedPath)) {
    unresolved.push(...extractVarNames(resolvedPath));
  }

  // 检查 headers
  for (const val of Object.values(request.headers)) {
    const resolved = resolveString(val, ctx);
    if (hasUnresolved(resolved)) {
      unresolved.push(...extractVarNames(resolved));
    }
  }

  // 检查 query
  for (const val of Object.values(request.query)) {
    const resolved = resolveString(val, ctx);
    if (hasUnresolved(resolved)) {
      unresolved.push(...extractVarNames(resolved));
    }
  }

  // 去重
  return [...new Set(unresolved)];
}

/**
 * 从字符串中提取 {{varName}} 中的变量名
 */
function extractVarNames(input: string): string[] {
  const vars: string[] = [];
  const regex = /\{\{\s*([^{}]+?)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input)) !== null) {
    vars.push(match[1]);
  }
  return vars;
}

/**
 * 批量检查跳过，返回需要跳过的用例 ID → SkipCheckResult 映射
 */
export function batchCheckSkip(
  testCases: TestCase[],
  ctx: SkipContext,
): Map<string, SkipCheckResult> {
  const results = new Map<string, SkipCheckResult>();
  for (const tc of testCases) {
    const result = checkSkip(tc, ctx);
    if (result.skipped) {
      results.set(tc.id, result);
    }
  }
  return results;
}
