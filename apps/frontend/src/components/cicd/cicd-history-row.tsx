import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CICDExecution } from "@/types/cicd";
import { CheckCircle, ChevronRight, Clock, AlertCircle, FileText, Loader2, Sparkles, Webhook, XCircle, Zap } from "lucide-react";

function TriggerTypeBadge({ type }: { type: string }) {
  const config: Record<string, { Icon: React.ElementType; label: string; bg: string; text: string }> = {
    "api-change": { Icon: FileText, label: "API 变更", bg: "bg-teal-100 dark:bg-teal-950/30", text: "text-teal-700 dark:text-teal-300" },
    schedule: { Icon: Clock, label: "定时", bg: "bg-blue-100 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-300" },
    webhook: { Icon: Webhook, label: "Webhook", bg: "bg-indigo-100 dark:bg-indigo-950/30", text: "text-indigo-700 dark:text-indigo-300" },
    manual: { Icon: Zap, label: "手动", bg: "bg-gray-100 dark:bg-gray-800/30", text: "text-gray-700 dark:text-gray-300" },
  };

  const { Icon, label, bg, text } = config[type] ?? config.manual;

  return (
    <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px]", bg, text)}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function CICDHistoryRow({
  execution,
  onView,
}: {
  execution: CICDExecution;
  onView: () => void;
}) {
  const resultConfig = {
    pass: { Icon: CheckCircle, color: "text-green-500" },
    fail: { Icon: XCircle, color: "text-red-500" },
    error: { Icon: AlertCircle, color: "text-amber-500" },
    running: { Icon: Loader2, color: "text-blue-500" },
  };

  const { Icon, color } = resultConfig[execution.result];

  return (
    <div
      className={cn(
        "rounded-lg border p-3 hover:bg-muted/30 transition-colors cursor-pointer",
        execution.result === "fail" && "border-red-200/50 dark:border-red-800/50",
      )}
      onClick={onView}
    >
      {/* Main row */}
      <div className="flex items-center gap-3">
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            color,
            execution.result === "running" && "animate-spin",
          )}
        />
        <span className="text-xs font-mono text-muted-foreground w-8">
          #{execution.number}
        </span>
        <span className="text-sm font-medium flex-1 truncate">
          {execution.name}
        </span>
        <Badge variant="outline" className="text-[10px]">
          {execution.environmentSlug}
        </Badge>
        <span className="text-xs font-mono text-muted-foreground">
          {execution.passed}/{execution.total}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDuration(execution.durationMs)}
        </span>
      </div>

      {/* Sub row */}
      <div className="flex items-center gap-2 mt-1.5 ml-7 text-[10px] text-muted-foreground">
        <TriggerTypeBadge type={execution.triggerType} />
        <span>{execution.triggerDetail}</span>
        <span>·</span>
        <span>{execution.triggeredAt}</span>
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-5 text-[10px]"
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
        >
          查看
          <ChevronRight className="h-2.5 w-2.5 ml-0.5" />
        </Button>
      </div>

      {/* AI analysis summary (only for failed) */}
      {execution.result === "fail" && execution.aiAnalysisSummary && (
        <div className="mt-2 ml-7 text-xs text-muted-foreground bg-red-50/30 dark:bg-red-950/20 rounded px-2 py-1.5">
          <Sparkles className="h-3 w-3 text-violet-500 inline mr-1" />
          {execution.aiAnalysisSummary}
        </div>
      )}
    </div>
  );
}
