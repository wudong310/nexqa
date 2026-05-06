import { describe, expect, it } from "vitest";
import {
  isRetryable,
  runWithConcurrency,
  withResultRetry,
  withRetry,
} from "../services/concurrency.js";

describe("runWithConcurrency", () => {
  it("应执行所有任务并按顺序返回结果", async () => {
    const tasks = [1, 2, 3, 4, 5].map(
      (n) => () => Promise.resolve(n * 10),
    );
    const results = await runWithConcurrency(tasks, { limit: 3 });
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it("空任务列表应返回空数组", async () => {
    const results = await runWithConcurrency([], { limit: 3 });
    expect(results).toEqual([]);
  });

  it("应限制并发数", async () => {
    let maxConcurrent = 0;
    let current = 0;

    const tasks = Array.from({ length: 10 }, () => async () => {
      current++;
      if (current > maxConcurrent) maxConcurrent = current;
      // 模拟异步耗时
      await new Promise((r) => setTimeout(r, 10));
      current--;
      return "ok";
    });

    await runWithConcurrency(tasks, { limit: 3 });
    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it("limit=1 应串行执行", async () => {
    const order: number[] = [];
    const tasks = [1, 2, 3].map(
      (n) => async () => {
        order.push(n);
        return n;
      },
    );
    const results = await runWithConcurrency(tasks, { limit: 1 });
    expect(results).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("应调用 onProgress 回调", async () => {
    const progress: [number, number][] = [];
    const tasks = [1, 2, 3].map((n) => () => Promise.resolve(n));

    await runWithConcurrency(tasks, {
      limit: 1,
      onProgress: (completed, total) => progress.push([completed, total]),
    });

    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("limit 超出范围应自动 clamp", async () => {
    const tasks = [1, 2].map((n) => () => Promise.resolve(n));
    // limit=0 → clamp 到 1
    const results1 = await runWithConcurrency(tasks, { limit: 0 });
    expect(results1).toEqual([1, 2]);
    // limit=100 → clamp 到 10
    const results2 = await runWithConcurrency(tasks, { limit: 100 });
    expect(results2).toEqual([1, 2]);
  });

  it("某个任务失败应传播错误", async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.reject(new Error("boom")),
      () => Promise.resolve(3),
    ];

    await expect(
      runWithConcurrency(tasks, { limit: 1 }),
    ).rejects.toThrow("boom");
  });
});

describe("isRetryable", () => {
  it("应识别 timeout 错误为可重试", () => {
    expect(isRetryable(new Error("Request timed out"))).toBe(true);
    expect(isRetryable(new Error("ECONNREFUSED"))).toBe(true);
    expect(isRetryable(new Error("fetch failed"))).toBe(true);
  });

  it("应识别逻辑错误为不可重试", () => {
    expect(isRetryable(new Error("invalid json"))).toBe(false);
    expect(isRetryable(new Error("validation failed"))).toBe(false);
  });

  it("应识别带 failType 的对象", () => {
    expect(isRetryable({ failType: "timeout" })).toBe(true);
    expect(isRetryable({ failType: "network_error" })).toBe(true);
    expect(isRetryable({ failType: "status_mismatch" })).toBe(false);
  });
});

describe("withRetry", () => {
  it("成功时不重试", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        return "ok";
      },
      { maxRetries: 3, delayMs: 0 },
    );
    expect(result.result).toBe("ok");
    expect(result.retryCount).toBe(0);
    expect(calls).toBe(1);
  });

  it("对可重试错误进行重试", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("ECONNREFUSED");
        return "recovered";
      },
      { maxRetries: 3, delayMs: 0 },
    );
    expect(result.result).toBe("recovered");
    expect(result.retryCount).toBe(2);
    expect(calls).toBe(3);
  });

  it("对不可重试错误直接抛出", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("validation failed");
        },
        { maxRetries: 3, delayMs: 0 },
      ),
    ).rejects.toThrow("validation failed");
    expect(calls).toBe(1);
  });

  it("达到最大重试次数后抛出最后的错误", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("ECONNREFUSED forever");
        },
        { maxRetries: 2, delayMs: 0 },
      ),
    ).rejects.toThrow("ECONNREFUSED forever");
    expect(calls).toBe(3); // 1 次原始 + 2 次重试
  });

  it("maxRetries=0 不重试", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("ECONNREFUSED");
        },
        { maxRetries: 0, delayMs: 0 },
      ),
    ).rejects.toThrow("ECONNREFUSED");
    expect(calls).toBe(1);
  });

  it("支持自定义 shouldRetry", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 2) throw new Error("custom-retryable");
        return "ok";
      },
      {
        maxRetries: 3,
        delayMs: 0,
        shouldRetry: (err) =>
          err instanceof Error && err.message.includes("custom-retryable"),
      },
    );
    expect(result.result).toBe("ok");
    expect(result.retryCount).toBe(1);
  });
});

describe("withResultRetry", () => {
  it("对成功结果不重试", async () => {
    let calls = 0;
    const result = await withResultRetry(
      async () => {
        calls++;
        return { passed: true, failType: null };
      },
      { maxRetries: 3, delayMs: 0 },
      (r) => r.failType,
    );
    expect(result.result.passed).toBe(true);
    expect(result.retryCount).toBe(0);
    expect(calls).toBe(1);
  });

  it("对可重试的 failType 进行重试", async () => {
    let calls = 0;
    const result = await withResultRetry(
      async () => {
        calls++;
        if (calls < 3) return { passed: false, failType: "timeout" };
        return { passed: true, failType: null };
      },
      { maxRetries: 3, delayMs: 0 },
      (r) => r.failType,
    );
    expect(result.result.passed).toBe(true);
    expect(result.retryCount).toBe(2);
  });

  it("对不可重试的 failType 直接返回", async () => {
    let calls = 0;
    const result = await withResultRetry(
      async () => {
        calls++;
        return { passed: false, failType: "status_mismatch" };
      },
      { maxRetries: 3, delayMs: 0 },
      (r) => r.failType,
    );
    expect(result.result.passed).toBe(false);
    expect(result.retryCount).toBe(0);
    expect(calls).toBe(1);
  });

  it("达到最大重试次数后返回最后结果", async () => {
    let calls = 0;
    const result = await withResultRetry(
      async () => {
        calls++;
        return { passed: false, failType: "network_error" };
      },
      { maxRetries: 2, delayMs: 0 },
      (r) => r.failType,
    );
    expect(result.result.passed).toBe(false);
    expect(result.retryCount).toBe(2);
    expect(calls).toBe(3);
  });
});
