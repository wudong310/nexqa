import type { TestCase, TestResult } from "@nexqa/shared";

type ExecFn = (tc: TestCase) => Promise<TestResult>;
type ProgressFn = (done: number, total: number) => void;

/**
 * 批量执行用例并报告进度
 */
export async function runBatch(
  cases: TestCase[],
  execFn: ExecFn,
  onProgress: ProgressFn,
): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;
  let done = 0;
  onProgress(0, cases.length);

  for (const tc of cases) {
    try {
      const result = await execFn(tc);
      if (result.passed) passed++;
      else failed++;
    } catch {
      failed++;
    }
    done++;
    onProgress(done, cases.length);
  }

  return { passed, failed };
}
