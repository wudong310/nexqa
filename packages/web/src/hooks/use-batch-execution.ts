import { useState } from "react";
import { toast } from "sonner";

type BatchRunFn = (
  checkedEpIds: Set<string>,
  onProgress: (done: number, total: number) => void,
) => Promise<{ passed: number; failed: number }>;

type SmokeFn = (
  onProgress: (done: number, total: number) => void,
) => Promise<{ passed: number; failed: number }>;

interface UseBatchExecutionOptions {
  handleExecuteChecked: BatchRunFn;
  handleQuickSmoke: SmokeFn;
  smokeCaseCount: number;
}

export function useBatchExecution({
  handleExecuteChecked,
  handleQuickSmoke,
  smokeCaseCount,
}: UseBatchExecutionOptions) {
  const [runningBatch, setRunningBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });

  async function executeChecked(checkedEpIds: Set<string>) {
    setRunningBatch(true);
    setBatchProgress({ done: 0, total: 0 });
    const { passed, failed } = await handleExecuteChecked(
      checkedEpIds,
      (done, total) => setBatchProgress({ done, total }),
    );
    setRunningBatch(false);
    toast.success(`执行完成：${passed} 通过 / ${failed} 失败`);
  }

  async function quickSmoke() {
    if (smokeCaseCount === 0) {
      toast.error("没有找到 smoke 或 P0 用例");
      return;
    }
    setRunningBatch(true);
    setBatchProgress({ done: 0, total: 0 });
    const { passed, failed } = await handleQuickSmoke(
      (done, total) => setBatchProgress({ done, total }),
    );
    setRunningBatch(false);
    toast.success(`冒烟执行完成：${passed} 通过 / ${failed} 失败`);
  }

  return { runningBatch, batchProgress, executeChecked, quickSmoke };
}
