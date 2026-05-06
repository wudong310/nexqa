import { PassRateBadge } from "@/components/ui/pass-rate-badge";
import type { TestReport } from "@/types/coverage";
import { cn } from "@/lib/utils";

interface ReportListItemProps {
  report: TestReport;
  isSelected: boolean;
  onClick: () => void;
}

function formatTrigger(trigger: string) {
  switch (trigger) {
    case "manual": return "手动触发";
    case "plan": return "方案触发";
    case "cli": return "CLI 触发";
    default: return trigger;
  }
}

function formatTime(ts: string) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function ReportListItem({
  report,
  isSelected,
  onClick,
}: ReportListItemProps) {
  return (
    <div
      className={cn(
        "px-3 py-3 cursor-pointer border-l-2 transition-colors hover:bg-accent/50",
        isSelected
          ? "border-l-primary bg-accent/30"
          : "border-l-transparent",
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium truncate">
          {report.planName ?? "批次"} #{report.batchNumber}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <span>{formatTime(report.summary.timestamp)}</span>
        <span>·</span>
        <span>{report.summary.environment} 环境</span>
      </div>
      <div className="flex items-center justify-between">
        <PassRateBadge value={report.summary.passRate} />
        <span className="text-[10px] text-muted-foreground">
          {formatTrigger(report.summary.triggeredBy)}
        </span>
      </div>
    </div>
  );
}
