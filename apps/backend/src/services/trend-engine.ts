import type { BatchRun, BatchRunResult, FailType } from "@nexqa/shared";
import { storage } from "./storage.js";

// ── Types ─────────────────────────────────────────────

export type TrendPeriod = "day" | "week" | "month";

export interface TrendDataPoint {
  /** 时间段标签，如 "2026-03-31" / "2026-W13" / "2026-03" */
  period: string;
  /** 该时间段内的批次数 */
  batchCount: number;
  /** 平均通过率 */
  avgPassRate: number;
  /** 总用例数 */
  totalCases: number;
  /** 总通过数 */
  totalPassed: number;
  /** 总失败数 */
  totalFailed: number;
  /** 失败类型分布 */
  failureTypes: Record<string, number>;
}

export interface TrendResult {
  projectId: string;
  period: TrendPeriod;
  range: number;
  data: TrendDataPoint[];
}

// ── Helpers ───────────────────────────────────────────

function formatPeriodKey(date: Date, period: TrendPeriod): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  switch (period) {
    case "day":
      return `${y}-${m}-${d}`;
    case "week": {
      // ISO week number
      const jan1 = new Date(y, 0, 1);
      const days = Math.floor((date.getTime() - jan1.getTime()) / 86400000);
      const weekNum = Math.ceil((days + jan1.getDay() + 1) / 7);
      return `${y}-W${String(weekNum).padStart(2, "0")}`;
    }
    case "month":
      return `${y}-${m}`;
  }
}

function getCutoffDate(range: number, period: TrendPeriod): Date {
  const now = new Date();
  switch (period) {
    case "day":
      now.setDate(now.getDate() - range);
      break;
    case "week":
      now.setDate(now.getDate() - range * 7);
      break;
    case "month":
      now.setMonth(now.getMonth() - range);
      break;
  }
  return now;
}

// ── Trend aggregation ─────────────────────────────────

export async function aggregateTrends(
  projectId: string,
  period: TrendPeriod = "day",
  range: number = 30,
): Promise<TrendResult> {
  // 1. 获取项目的所有已完成 BatchRun
  const allBatches = await storage.list<BatchRun>("batch-runs");
  const cutoff = getCutoffDate(range, period);

  const batches = allBatches
    .filter(
      (b) =>
        b.projectId === projectId &&
        (b.status === "completed" || b.status === "failed") &&
        b.completedAt &&
        new Date(b.completedAt) >= cutoff,
    )
    .sort(
      (a, b) =>
        new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime(),
    );

  // 2. 加载失败类型（如果需要） — 从 batch-run-results
  const allBrResults = await storage.list<BatchRunResult>("batch-run-results");
  const brResultsByBatch = new Map<string, BatchRunResult[]>();
  for (const brr of allBrResults) {
    const arr = brResultsByBatch.get(brr.batchRunId) || [];
    arr.push(brr);
    brResultsByBatch.set(brr.batchRunId, arr);
  }

  // 3. 按时间段分组
  const grouped = new Map<string, BatchRun[]>();
  for (const batch of batches) {
    const key = formatPeriodKey(new Date(batch.completedAt!), period);
    const arr = grouped.get(key) || [];
    arr.push(batch);
    grouped.set(key, arr);
  }

  // 4. 聚合每个时间段
  const data: TrendDataPoint[] = [];
  for (const [periodKey, batchesInPeriod] of grouped) {
    let totalCases = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    const failureTypes: Record<string, number> = {};

    for (const batch of batchesInPeriod) {
      totalCases += batch.totalCases || 0;
      totalPassed += batch.passedCases || 0;
      totalFailed += batch.failedCases || 0;

      // 合并失败类型（从 batch 的 failureBreakdown）
      if (batch.failureBreakdown) {
        for (const [ft, count] of Object.entries(batch.failureBreakdown)) {
          failureTypes[ft] = (failureTypes[ft] || 0) + (count as number);
        }
      }
    }

    const avgPassRate =
      totalCases > 0 ? totalPassed / totalCases : 0;

    data.push({
      period: periodKey,
      batchCount: batchesInPeriod.length,
      avgPassRate: Math.round(avgPassRate * 10000) / 10000,
      totalCases,
      totalPassed,
      totalFailed,
      failureTypes,
    });
  }

  return {
    projectId,
    period,
    range,
    data,
  };
}
