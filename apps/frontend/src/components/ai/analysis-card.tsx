import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FailureItem } from "@/types/ai";
import { ChevronRight, Lightbulb, Wrench } from "lucide-react";
import { ConfidenceBadge } from "./confidence-badge";

const categoryStyles: Record<string, { border: string; bg: string }> = {
  "api-bug": {
    border: "border-red-200 dark:border-red-800",
    bg: "bg-red-50/30 dark:bg-red-950/20",
  },
  "api-change": {
    border: "border-orange-200 dark:border-orange-800",
    bg: "bg-orange-50/30 dark:bg-orange-950/20",
  },
  "env-issue": {
    border: "border-amber-200 dark:border-amber-800",
    bg: "bg-amber-50/30 dark:bg-amber-950/20",
  },
  "auth-expired": {
    border: "border-amber-200 dark:border-amber-800",
    bg: "bg-amber-50/30 dark:bg-amber-950/20",
  },
  "test-case-error": {
    border: "border-blue-200 dark:border-blue-800",
    bg: "bg-blue-50/30 dark:bg-blue-950/20",
  },
  "test-data-issue": {
    border: "border-blue-200 dark:border-blue-800",
    bg: "bg-blue-50/30 dark:bg-blue-950/20",
  },
  flaky: {
    border: "border-gray-200 dark:border-gray-800",
    bg: "bg-gray-50/30 dark:bg-gray-950/20",
  },
  "dependency-fail": {
    border: "border-gray-200 dark:border-gray-800",
    bg: "bg-gray-50/30 dark:bg-gray-950/20",
  },
  timeout: {
    border: "border-amber-200 dark:border-amber-800",
    bg: "bg-amber-50/30 dark:bg-amber-950/20",
  },
  unknown: {
    border: "border-gray-200 dark:border-gray-800",
    bg: "bg-gray-50/30 dark:bg-gray-950/20",
  },
};

export function AnalysisCard({
  analysis,
  onViewDetail,
  onAutoFix,
}: {
  analysis: FailureItem;
  onViewDetail?: (resultId: string) => void;
  onAutoFix?: (analysis: FailureItem) => void;
}) {
  const style = categoryStyles[analysis.rootCause] ?? categoryStyles.unknown;
  const targetLabel =
    analysis.suggestion.target === "api"
      ? "开发"
      : analysis.suggestion.target === "environment"
        ? "运维"
        : "测试";

  return (
    <div
      className={cn(
        "rounded-lg border p-4 space-y-3",
        style.border,
        style.bg,
      )}
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium truncate min-w-0">
          {analysis.endpoint} — {analysis.caseName}
        </p>
        <ConfidenceBadge value={analysis.confidence} />
      </div>

      {/* Root cause */}
      <p className="text-xs">
        <span className="font-medium">根因:</span> {analysis.analysis}
      </p>

      {/* Suggestion */}
      <div className="text-xs space-y-1">
        <p className="font-medium flex items-center gap-1">
          <Lightbulb className="h-3 w-3 text-amber-500" />
          修复建议:
        </p>
        <p className="text-muted-foreground pl-4">
          {analysis.suggestion.summary}
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[10px] text-muted-foreground">
          📋 目标: {targetLabel}
        </span>
        {onViewDetail && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => onViewDetail(analysis.resultId)}
          >
            查看用例详情
            <ChevronRight className="h-3 w-3 ml-0.5" />
          </Button>
        )}
      </div>

      {/* Auto-fix */}
      {analysis.suggestion.autoFix && onAutoFix && (
        <div className="pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={() => onAutoFix(analysis)}
          >
            <Wrench className="h-3 w-3" />
            自动修复此用例
          </Button>
        </div>
      )}
    </div>
  );
}
