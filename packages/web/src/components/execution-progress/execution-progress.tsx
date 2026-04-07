import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  SkipForward,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { GateBadge } from "./gate-badge";
import { FailureSummary } from "./failure-summary";
import { StagePipeline } from "./stage-pipeline";
import type { StageNodeData } from "./stage-node";

// ── Types ───────────────────────────────────────────

export interface StageProgress {
  name: string;
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  total: number;
  completed: number;
  passed: number;
  failed: number;
  skipped: number;
  gateEnabled: boolean;
  gateResult?: "passed" | "failed" | null;
  gateAction?: "abort" | "continue";
  /** Individual case results within this stage */
  cases?: StageCaseResult[];
}

export interface StageCaseResult {
  id: string;
  name: string;
  method?: string;
  path?: string;
  status: "passed" | "failed" | "skipped" | "running" | "pending";
  duration?: number;
  failReason?: string;
  failType?: string;
  isSecurity?: boolean;
}

interface ExecutionProgressProps {
  stages: StageProgress[];
  isRunning?: boolean;
  className?: string;
}

// ── Stage Status Helpers ────────────────────────────

function caseStatusIcon(status: StageCaseResult["status"]) {
  switch (status) {
    case "passed":
      return <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />;
    case "running":
      return (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 shrink-0" />
      );
    case "skipped":
      return <SkipForward className="h-3.5 w-3.5 text-gray-400 shrink-0" />;
    case "pending":
    default:
      return (
        <div className="h-3.5 w-3.5 rounded-full border border-gray-300 shrink-0" />
      );
  }
}

// ── Stage Detail Section ────────────────────────────

function StageDetail({
  stage,
  defaultExpanded,
}: {
  stage: StageProgress;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const passRate =
    stage.completed > 0 ? stage.passed / stage.completed : 0;
  const progressPct =
    stage.total > 0 ? Math.round((stage.completed / stage.total) * 100) : 0;

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Stage header */}
      <button
        type="button"
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/30 transition-colors",
          stage.status === "running" && "bg-blue-50/50 dark:bg-blue-950/20",
        )}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}

        <span className="text-sm font-medium flex-1 truncate">
          {stage.name}
          {stage.status === "running" && (
            <span className="text-xs text-muted-foreground ml-1">
              (执行中)
            </span>
          )}
          {stage.status === "passed" && (
            <span className="text-xs text-muted-foreground ml-1">
              (已完成)
            </span>
          )}
        </span>

        {/* Gate badge */}
        {stage.gateEnabled && stage.gateResult && (
          <GateBadge result={stage.gateResult} />
        )}

        <span className="text-xs text-muted-foreground shrink-0">
          {stage.completed}/{stage.total}
        </span>
      </button>

      {/* Progress bar */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-3">
          <Progress
            value={progressPct}
            className="flex-1 h-2"
            indicatorClassName={cn(
              passRate >= 0.95
                ? "bg-green-500"
                : passRate >= 0.8
                  ? "bg-amber-500"
                  : "bg-red-500",
              stage.status === "running" && "bg-blue-500",
            )}
          />
          {stage.completed > 0 && (
            <span className="text-xs font-medium whitespace-nowrap">
              通过率 {Math.round(passRate * 100)}%
            </span>
          )}
        </div>

        {/* Gate warning */}
        {stage.gateResult === "failed" && stage.gateAction && (
          <div
            className={cn(
              "mt-2 text-xs px-2 py-1 rounded",
              stage.gateAction === "abort"
                ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
            )}
          >
            {stage.gateAction === "abort"
              ? "门禁失败，执行已中止。后续阶段已跳过。"
              : `门禁失败但继续执行。${Math.round(passRate * 100)}% 未达阈值。`}
          </div>
        )}
      </div>

      {/* Case list */}
      {expanded && stage.cases && stage.cases.length > 0 && (
        <div className="border-t divide-y max-h-[400px] overflow-y-auto">
          {stage.cases.map((c) => (
            <CaseRow key={c.id} caseResult={c} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Case Row ────────────────────────────────────────

function CaseRow({ caseResult }: { caseResult: StageCaseResult }) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2 text-sm",
          "hover:bg-accent/50 transition-colors cursor-pointer",
          caseResult.status === "failed" &&
            "bg-red-50/50 dark:bg-red-950/20 border-l-2 border-l-red-500",
          caseResult.status === "skipped" &&
            "opacity-60 bg-amber-50/30 dark:bg-amber-950/10",
        )}
        onClick={() =>
          caseResult.status === "failed" && setShowDetail(!showDetail)
        }
      >
        {caseStatusIcon(caseResult.status)}
        <span className="font-medium truncate min-w-0 flex-1">
          {caseResult.name}
        </span>
        {caseResult.method && (
          <Badge variant="outline" className="text-[10px] shrink-0">
            {caseResult.method}
          </Badge>
        )}
        {caseResult.path && (
          <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px] hidden sm:inline">
            {caseResult.path}
          </span>
        )}
        <span className="text-xs text-muted-foreground shrink-0 w-16 text-right">
          {caseResult.duration ? `${caseResult.duration}ms` : "—"}
        </span>
        {caseResult.status === "failed" && (
          <ChevronRight
            className={cn(
              "h-3 w-3 text-muted-foreground transition-transform shrink-0",
              showDetail && "rotate-90",
            )}
          />
        )}
      </div>
      {/* Failure detail expanded */}
      {showDetail && caseResult.failReason && (
        <div className="px-10 py-2 bg-red-50/30 dark:bg-red-950/10 border-t text-xs space-y-1">
          {caseResult.failType && (
            <div>
              <span className="text-muted-foreground">失败类型: </span>
              <span className="font-medium">{caseResult.failType}</span>
            </div>
          )}
          <div className="font-mono text-red-600 dark:text-red-400 whitespace-pre-wrap">
            {caseResult.failReason}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────

export function ExecutionProgress({
  stages,
  isRunning,
  className,
}: ExecutionProgressProps) {
  if (stages.length === 0) return null;

  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [userScrolled, setUserScrolled] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const runningRowRef = useRef<HTMLDivElement>(null);

  // Auto-detect running stage
  useEffect(() => {
    const runningIdx = stages.findIndex((s) => s.status === "running");
    if (runningIdx >= 0) {
      setActiveStageIndex(runningIdx);
    }
  }, [stages]);

  // Auto-scroll to running case
  useEffect(() => {
    if (!userScrolled && isRunning && runningRowRef.current) {
      runningRowRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [userScrolled, isRunning, stages]);

  // Detect manual scroll
  const handleScroll = useCallback(() => {
    if (isRunning) {
      setUserScrolled(true);
    }
  }, [isRunning]);

  function scrollToCurrent() {
    setUserScrolled(false);
    runningRowRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  // Build pipeline data
  const pipelineStages: StageNodeData[] = stages.map((s) => ({
    name: s.name,
    status: s.status === "pending" ? "waiting" : s.status,
    progress: { done: s.completed, total: s.total },
    passRate:
      s.completed > 0 ? Math.round((s.passed / s.completed) * 100) : undefined,
    gateResult: s.gateResult,
  }));

  // Total progress
  const totalDone = stages.reduce((sum, s) => sum + s.completed, 0);
  const totalAll = stages.reduce((sum, s) => sum + s.total, 0);
  const totalPct = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0;

  // Collect failures for summary
  const allFailures = stages.flatMap((s) =>
    (s.cases ?? [])
      .filter((c) => c.status === "failed")
      .map((c) => ({
        id: c.id,
        caseName: c.name,
        method: c.method ?? "",
        path: c.path ?? "",
        stage: s.name,
        failType: c.failType ?? "unknown",
        isSecurity: c.isSecurity,
      })),
  );

  return (
    <div
      ref={containerRef}
      className={cn("space-y-4", className)}
      onScroll={handleScroll}
    >
      {/* Horizontal stage pipeline */}
      <StagePipeline
        stages={pipelineStages}
        activeStageIndex={activeStageIndex}
        onStageClick={setActiveStageIndex}
      />

      {/* Total progress bar */}
      <div className="flex items-center gap-3">
        <Progress value={totalPct} className="flex-1 h-2" />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {totalDone}/{totalAll} ({totalPct}%)
        </span>
      </div>

      {/* Failure summary (only when there are failures) */}
      {allFailures.length > 0 && (
        <FailureSummary
          failures={allFailures}
          onJump={(id: string) => {
            // Scroll to the failure row
            const el = document.getElementById(`case-row-${id}`);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              el.classList.add("ring-2", "ring-red-400");
              setTimeout(
                () => el.classList.remove("ring-2", "ring-red-400"),
                2000,
              );
            }
          }}
        />
      )}

      {/* Stage details */}
      {stages.map((stage, i) => (
        <StageDetail
          key={stage.name}
          stage={stage}
          defaultExpanded={i === activeStageIndex}
        />
      ))}

      {/* "Back to current" button */}
      {userScrolled && isRunning && (
        <Button
          variant="secondary"
          size="sm"
          className="fixed bottom-6 right-6 shadow-lg z-50"
          onClick={scrollToCurrent}
        >
          <ArrowDown className="h-3.5 w-3.5 mr-1" />
          回到当前执行
        </Button>
      )}
    </div>
  );
}
