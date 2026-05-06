import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { BatchAnalysis, FailureItem, AnalysisStep } from "@/types/ai";
import {
  AlertTriangle,
  CheckCircle,
  Copy,
  Inbox,
  Sparkles,
  XCircle,
} from "lucide-react";
import { AnalysisCard } from "./analysis-card";
import { AnalysisProgress } from "./analysis-progress";
import { CategoryGroupHeader } from "./category-group-header";
import { toast } from "sonner";

interface AnalysisSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysis: BatchAnalysis | null;
  isLoading?: boolean;
  analysisSteps?: AnalysisStep[];
  onViewDetail?: (resultId: string) => void;
  onAutoFix?: (item: FailureItem) => void;
  error?: Error | null;
  onRetry?: () => void;
}

export function AnalysisSheet({
  open,
  onOpenChange,
  analysis,
  isLoading,
  analysisSteps,
  onViewDetail,
  onAutoFix,
  error,
  onRetry,
}: AnalysisSheetProps) {
  function handleCopyReport() {
    if (!analysis) return;
    const lines: string[] = [];
    lines.push(`AI 分析报告 — ${analysis.overallAssessment.summary}`);
    lines.push("");
    for (const group of analysis.groups) {
      lines.push(`## ${group.category} (${group.count})`);
      for (const item of group.items) {
        lines.push(`- ${item.endpoint}: ${item.analysis}`);
        lines.push(`  建议: ${item.suggestion.summary}`);
      }
      lines.push("");
    }
    if (analysis.actionItems.length) {
      lines.push("## 行动建议");
      for (const a of analysis.actionItems) {
        lines.push(`${a.priority}: [${a.target}] ${a.action}`);
      }
    }
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("分析报告已复制到剪贴板");
  }

  const assessmentVariant =
    analysis?.overallAssessment.status === "critical"
      ? "destructive"
      : "default";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[540px] sm:max-w-[540px] flex flex-col" side="right">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            AI 智能分析
          </SheetTitle>
          <SheetDescription>
            {isLoading && "AI 正在分析项目 API 质量..."}
            {!isLoading && analysis && "分析完成，查看结果和行动建议"}
            {!isLoading && error && "分析执行失败"}
            {!isLoading && !analysis && !error && "请先执行批量测试，再使用 AI 分析"}
          </SheetDescription>
        </SheetHeader>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Loading state */}
          {isLoading && analysisSteps && (
            <>
              <AnalysisProgress steps={analysisSteps} />
              <p className="text-xs text-muted-foreground">
                💡 AI 正在分析请求-响应对，推断失败根因... 预计需要 5-10 秒
              </p>
            </>
          )}

          {/* Error state */}
          {error && !isLoading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <XCircle className="h-10 w-10 text-destructive" />
              <p className="text-sm text-destructive">
                {error.message || "分析失败，请重试"}
              </p>
              {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  重试分析
                </Button>
              )}
            </div>
          )}

          {/* Empty state — no analysis result */}
          {!analysis && !isLoading && !error && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <Inbox className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold">暂无分析结果</h3>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-[320px]">
                  请先执行批量测试，再使用 AI 分析失败原因
                </p>
              </div>
            </div>
          )}

          {/* Analysis result */}
          {analysis && !isLoading && (
            <>
              {/* Overall assessment */}
              <Alert variant={assessmentVariant}>
                {analysis.overallAssessment.status === "healthy" ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                <AlertTitle>
                  {analysis.overallAssessment.status === "healthy"
                    ? "全部健康"
                    : analysis.overallAssessment.status === "critical"
                      ? "发现严重问题"
                      : "发现问题"}
                </AlertTitle>
                <AlertDescription className="text-xs">
                  {analysis.overallAssessment.summary}
                </AlertDescription>
              </Alert>

              {/* Groups */}
              {analysis.groups.map((group) => (
                <div key={group.category}>
                  <CategoryGroupHeader
                    category={group.category}
                    count={group.count}
                  />
                  <div className="space-y-3">
                    {group.items.map((item) => (
                      <AnalysisCard
                        key={item.resultId}
                        analysis={item}
                        onViewDetail={onViewDetail}
                        onAutoFix={onAutoFix}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Action items */}
              {analysis.actionItems.length > 0 && (
                <div className="pt-4 border-t space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    📋 行动建议
                  </h3>
                  {analysis.actionItems.map((a, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      <span className="font-medium">{a.priority}:</span> [{a.target}]{" "}
                      {a.action}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        {analysis && !isLoading && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleCopyReport}
            >
              <Copy className="h-3.5 w-3.5" />
              复制分析报告
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
