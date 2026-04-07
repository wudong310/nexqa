import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { ConfidenceBadge } from "./confidence-badge";
import type { FailureItem } from "@/types/ai";

interface InlineAnalysisProps {
  analysis?: FailureItem | null;
  isAnalyzing?: boolean;
  onAnalyze?: () => void;
}

export function InlineAnalysis({
  analysis,
  isAnalyzing,
  onAnalyze,
}: InlineAnalysisProps) {
  // Not analyzed yet — show button
  if (!analysis) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-xs gap-1.5 text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30"
        onClick={onAnalyze}
        disabled={isAnalyzing}
      >
        <Sparkles className="h-3 w-3" />
        {isAnalyzing ? "AI 分析中..." : "AI 分析此失败"}
      </Button>
    );
  }

  // Analyzed — show inline result card
  return (
    <div className="rounded-lg border bg-violet-50/30 dark:bg-violet-950/20 border-violet-200/50 dark:border-violet-800/50 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-violet-500" />
        <span className="text-xs font-medium">AI 分析结果</span>
        <ConfidenceBadge value={analysis.confidence} />
      </div>
      <div className="space-y-1.5">
        <p className="text-xs">
          <span className="font-medium">根因:</span> {analysis.analysis}
        </p>
        <p className="text-xs">
          <span className="font-medium">建议:</span>{" "}
          {analysis.suggestion.summary}
        </p>
      </div>
    </div>
  );
}
