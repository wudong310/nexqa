import { api } from "@/lib/api";
import type { BatchRun } from "@nexqa/shared";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  ExecutionProgress,
  type StageProgress,
} from "./execution-progress";

// ── Types ───────────────────────────────────────────

interface BatchRunWithStages extends BatchRun {
  stages?: {
    name: string;
    status: string;
    total: number;
    completed: number;
    passed: number;
    failed: number;
    skipped: number;
    gateEnabled: boolean;
    gateResult?: string | null;
    gateAction?: string | null;
    cases?: {
      id: string;
      name: string;
      method?: string;
      path?: string;
      status: string;
      duration?: number;
      failReason?: string;
      failType?: string;
      isSecurity?: boolean;
    }[];
  }[];
}

interface ExecutionProgressPanelProps {
  batchRunId: string | null;
  className?: string;
}

// ── Component ───────────────────────────────────────

export function ExecutionProgressPanel({
  batchRunId,
  className,
}: ExecutionProgressPanelProps) {
  const { data: batchRun, isLoading } = useQuery<BatchRunWithStages>({
    queryKey: ["batch-run-progress", batchRunId],
    queryFn: () => api.get(`/batch-runs/detail?id=${batchRunId}`),
    enabled: !!batchRunId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "running" || status === "pending") return 2000;
      return false;
    },
  });

  if (!batchRunId) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
        <span className="text-sm text-muted-foreground">加载执行进度…</span>
      </div>
    );
  }

  if (!batchRun) return null;

  const isRunning =
    batchRun.status === "running" || batchRun.status === "pending";

  // If the backend provides stages, use them
  if (batchRun.stages && batchRun.stages.length > 0) {
    const stages: StageProgress[] = batchRun.stages.map((s) => ({
      name: s.name,
      status: s.status as StageProgress["status"],
      total: s.total,
      completed: s.completed,
      passed: s.passed,
      failed: s.failed,
      skipped: s.skipped,
      gateEnabled: s.gateEnabled,
      gateResult: s.gateResult as StageProgress["gateResult"],
      gateAction: s.gateAction as StageProgress["gateAction"],
      cases: s.cases?.map((c) => ({
        id: c.id,
        name: c.name,
        method: c.method,
        path: c.path,
        status: c.status as "passed" | "failed" | "skipped" | "running" | "pending",
        duration: c.duration,
        failReason: c.failReason,
        failType: c.failType,
        isSecurity: c.isSecurity,
      })),
    }));
    return (
      <ExecutionProgress
        stages={stages}
        isRunning={isRunning}
        className={className}
      />
    );
  }

  // Fallback: show a single-stage summary from batch run counters
  const total = batchRun.totalCases;
  const completed =
    batchRun.passedCases + batchRun.failedCases + batchRun.skippedCases;

  const stages: StageProgress[] = [
    {
      name: batchRun.name || "执行中",
      status: isRunning
        ? "running"
        : batchRun.failedCases > 0
          ? "failed"
          : "passed",
      total,
      completed,
      passed: batchRun.passedCases,
      failed: batchRun.failedCases,
      skipped: batchRun.skippedCases,
      gateEnabled: false,
    },
  ];

  return (
    <ExecutionProgress
      stages={stages}
      isRunning={isRunning}
      className={className}
    />
  );
}
