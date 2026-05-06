/**
 * 并发控制 — 信号量模式
 *
 * 限制同时执行的异步任务数。手写实现，不引入 p-limit 依赖。
 */

export interface ConcurrencyOptions {
  /** 最大并发数，范围 1-10，默认 3 */
  limit: number;
  /** 进度回调 */
  onProgress?: (completed: number, total: number) => void;
}

/**
 * 以限定并发数执行一组异步任务
 *
 * @param tasks - 任务工厂函数数组（每个函数返回 Promise）
 * @param options - 并发选项
 * @returns 按输入顺序排列的结果数组
 */
export async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  options: ConcurrencyOptions,
): Promise<T[]> {
  const { limit, onProgress } = options;
  const effectiveLimit = Math.max(1, Math.min(10, limit));

  if (tasks.length === 0) return [];

  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= tasks.length) return;

      results[index] = await tasks[index]();
      completed++;
      onProgress?.(completed, tasks.length);
    }
  }

  // 启动 min(limit, tasks.length) 个 worker
  const workerCount = Math.min(effectiveLimit, tasks.length);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}

/**
 * 失败重试 — 可配置重试次数和延迟
 */

export interface RetryOptions {
  /** 最大重试次数（0 = 不重试），范围 0-3，默认 0 */
  maxRetries: number;
  /** 重试间隔（毫秒），范围 0-5000，默认 1000 */
  delayMs: number;
  /** 判断是否应重试的函数。默认只对 timeout 和 network_error 重试 */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export interface RetryResult<T> {
  result: T;
  /** 实际重试次数（0 = 一次成功） */
  retryCount: number;
}

/**
 * 可重试的失败类型（网络问题可能因重试恢复，逻辑错误不会）
 */
const RETRYABLE_FAIL_TYPES = new Set(["timeout", "network_error", "connection_error"]);

/**
 * 默认重试判断：只有网络类错误才重试
 */
export function isRetryable(error: unknown): boolean {
  if (error && typeof error === "object" && "failType" in error) {
    return RETRYABLE_FAIL_TYPES.has((error as { failType: string }).failType);
  }
  // 对于 Error 类型，检查消息
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("timeout") ||
      msg.includes("timed out") ||
      msg.includes("econnrefused") ||
      msg.includes("econnreset") ||
      msg.includes("enotfound") ||
      msg.includes("fetch failed") ||
      msg.includes("network")
    );
  }
  return false;
}

/**
 * 延迟指定毫秒
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 带重试地执行一个异步操作
 *
 * @param fn - 要执行的异步函数
 * @param options - 重试选项
 * @returns 包含结果和重试次数的对象
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<RetryResult<T>> {
  const { maxRetries, delayMs, shouldRetry } = options;
  const effectiveMaxRetries = Math.max(0, Math.min(3, maxRetries));
  const effectiveDelay = Math.max(0, Math.min(5000, delayMs));

  let lastError: unknown;

  for (let attempt = 0; attempt <= effectiveMaxRetries; attempt++) {
    try {
      const result = await fn();
      return { result, retryCount: attempt };
    } catch (error) {
      lastError = error;

      // 最后一次尝试，不再重试
      if (attempt >= effectiveMaxRetries) break;

      // 判断是否应重试
      const canRetry = shouldRetry
        ? shouldRetry(error, attempt + 1)
        : isRetryable(error);

      if (!canRetry) break;

      // 等待后重试
      if (effectiveDelay > 0) {
        await delay(effectiveDelay);
      }
    }
  }

  throw lastError;
}

/**
 * 带重试地执行，如果函数不抛错但返回"失败"结果，也支持重试
 * 
 * 适用于测试执行场景：函数不抛错，但返回的 TestResult.passed === false
 *
 * @param fn - 要执行的异步函数
 * @param options - 重试选项
 * @param isFailure - 判断结果是否为"失败"，返回 failType 或 null
 * @returns 包含结果和重试次数的对象
 */
export async function withResultRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  isFailure: (result: T) => string | null,
): Promise<RetryResult<T>> {
  const { maxRetries, delayMs } = options;
  const effectiveMaxRetries = Math.max(0, Math.min(3, maxRetries));
  const effectiveDelay = Math.max(0, Math.min(5000, delayMs));

  let lastResult: T | undefined;

  for (let attempt = 0; attempt <= effectiveMaxRetries; attempt++) {
    const result = await fn();
    const failType = isFailure(result);

    // 成功或不可重试的失败
    if (failType === null || !RETRYABLE_FAIL_TYPES.has(failType)) {
      return { result, retryCount: attempt };
    }

    lastResult = result;

    // 最后一次尝试
    if (attempt >= effectiveMaxRetries) break;

    // 等待后重试
    if (effectiveDelay > 0) {
      await delay(effectiveDelay);
    }
  }

  return { result: lastResult as T, retryCount: effectiveMaxRetries };
}
