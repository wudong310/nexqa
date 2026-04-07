import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { StatMiniCard } from "./stat-mini-card";
import { StageResultPanel } from "./stage-result-panel";
import { FailureAnalysisPanel } from "./failure-analysis";
import { ComparisonView } from "./comparison-view";
import type { TestReport } from "@/types/coverage";
import { Download, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReportDetailProps {
  report: TestReport;
  onExport?: () => void;
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatDate(ts: string) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function getPassRateColor(rate: number) {
  if (rate >= 0.95) return "text-green-600";
  if (rate >= 0.8) return "text-amber-600";
  return "text-red-600";
}

export function ReportDetail({ report, onExport }: ReportDetailProps) {
  const s = report.summary;

  return (
    <div className="space-y-6 p-6 overflow-y-auto max-h-[calc(100vh-8rem)]">
      {/* Title bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {report.planName ?? "批次"} #{report.batchNumber}
        </h2>
        <div className="flex items-center gap-2">
          {onExport && (
            <Button variant="outline" size="sm" className="text-xs" onClick={onExport}>
              <Download className="h-3 w-3 mr-1" />
              导出
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatMiniCard
          label="通过率"
          value={`${Math.round(s.passRate * 100)}%`}
          delta={
            report.comparison
              ? Math.round(report.comparison.passRateDelta * 100)
              : undefined
          }
          valueColor={getPassRateColor(s.passRate)}
        />
        <StatMiniCard
          label="总用例"
          value={s.totalCases}
          delta={report.comparison?.newCases}
        />
        <StatMiniCard
          label="通过"
          value={s.passed}
          valueColor="text-green-600"
        />
        <StatMiniCard
          label="失败"
          value={s.failed}
          valueColor={s.failed > 0 ? "text-red-600" : undefined}
        />
        <StatMiniCard label="耗时" value={formatDuration(s.duration)} />
      </div>

      {/* Meta info */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          环境: {s.environment} · 触发: {s.triggeredBy === "manual" ? "手动" : s.triggeredBy === "plan" ? "方案" : "CLI"} · 时间: {formatDate(s.timestamp)}
        </p>
        <p>
          判定:{" "}
          <span className={cn(s.passRate >= 0.95 ? "text-green-600" : "text-red-600")}>
            {s.passRate >= 0.95 ? "✅ 达标" : `❌ 未达标 (通过率 ${Math.round(s.passRate * 100)}% < 目标 95%)`}
          </span>
        </p>
      </div>

      <Separator />

      {/* Stage results */}
      {report.stages.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">阶段结果</h3>
          {report.stages.map((stage) => (
            <StageResultPanel key={stage.name} stage={stage} />
          ))}
        </div>
      )}

      <Separator />

      {/* Failure analysis */}
      {s.failed > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">失败分析</h3>
          <FailureAnalysisPanel analysis={report.failureAnalysis} />
        </div>
      )}

      {/* Comparison */}
      {report.comparison && (
        <>
          <Separator />
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">与上次对比</h3>
            <ComparisonView comparison={report.comparison} />
          </div>
        </>
      )}
    </div>
  );
}
