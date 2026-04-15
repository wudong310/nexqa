import { PlanStageCard } from "@/components/test-plans/plan-stage-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { PlanGenerationResult } from "@/types/plan-gen";
import {
  CheckCircle,
  ExternalLink,
  Inbox,
  Lightbulb,
  Loader2,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";

import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

interface PlanGenSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isGenerating: boolean;
  result: PlanGenerationResult | null;
  onAdopt: () => void;
  onDiscard: () => void;
  isAdopting: boolean;
  error?: Error | null;
  onRetry?: () => void;
  projectId?: string;
}

export function PlanGenSheet({
  open,
  onOpenChange,
  isGenerating,
  result,
  onAdopt,
  onDiscard,
  isAdopting,
  error,
  onRetry,
  projectId,
}: PlanGenSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[600px] sm:max-w-[600px] flex flex-col" side="right">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            AI 生成测试方案
          </SheetTitle>
          <SheetDescription>
            {isGenerating && "正在生成测试方案..."}
            {!isGenerating && result && "方案已生成，请查看并决定是否采纳"}
            {!isGenerating && error && "方案生成失败"}
            {!isGenerating && !result && !error && "AI 将根据项目 API 自动生成测试方案"}
          </SheetDescription>
        </SheetHeader>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Generating state */}
          {isGenerating && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
              <p className="text-sm text-muted-foreground">
                AI 正在分析项目并生成测试方案...
              </p>
            </div>
          )}

          {/* Error state */}
          {!isGenerating && error && (
            <div className="flex flex-col items-center gap-3 py-8">
              <XCircle className="h-10 w-10 text-destructive" />
              <p className="text-sm text-destructive">
                {error.message || "方案生成失败，请重试"}
              </p>
              {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  重试生成
                </Button>
              )}
            </div>
          )}

          {/* Empty state — no result and no error */}
          {!isGenerating && !result && !error && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <Inbox className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold">暂无可生成方案</h3>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-[320px]">
                  请先为项目添加 API 端点和测试用例，AI 才能生成测试方案
                </p>
              </div>
              {projectId && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    to="/p/$projectId/api"
                    params={{ projectId }}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    前往测试用例
                  </Link>
                </Button>
              )}
            </div>
          )}

          {/* Result */}
          {!isGenerating && result && (
            <>
              {/* Intent */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">意图:</span>
                <Badge variant="outline" className="text-xs">
                  {result.userIntent}
                </Badge>
                <Badge
                  variant="outline"
                  className="text-[10px] border-violet-200 text-violet-600 dark:border-violet-700 dark:text-violet-400"
                >
                  {result.parsedIntent.type}
                </Badge>
              </div>

              {/* Plan overview */}
              <Card>
                <CardContent className="pt-4 space-y-1">
                  <h3 className="text-base font-semibold">
                    📋 {result.generatedPlan.name}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {result.generatedPlan.description}
                  </p>
                </CardContent>
              </Card>

              {/* Stages */}
              {result.generatedPlan.stages &&
                result.generatedPlan.stages.length > 0 && (
                  <Card>
                    <CardContent className="pt-3 pb-0">
                      {result.generatedPlan.stages.map((stage, i) => (
                        <PlanStageCard
                          key={stage.order}
                          stage={stage}
                          index={i + 1}
                        />
                      ))}
                    </CardContent>
                  </Card>
                )}

              {/* Execution config */}
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  执行配置
                </h4>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">
                    并发: {result.generatedPlan.execution.concurrency}
                  </Badge>
                  <Badge variant="secondary">
                    重试: {result.generatedPlan.execution.retryOnFail} 次
                  </Badge>
                  <Badge variant="secondary">
                    超时: {result.generatedPlan.execution.timeoutMs / 1000}s
                  </Badge>
                  {result.generatedPlan.execution.stopOnGateFail && (
                    <Badge variant="secondary">门禁失败停止</Badge>
                  )}
                </div>
              </div>

              {/* Match stats */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  匹配: {result.matchStats.matchedCases}/
                  {result.matchStats.totalCases} 个用例
                </span>
                {result.matchStats.matchedChains > 0 && (
                  <span>+ {result.matchStats.matchedChains} 条测试链</span>
                )}
              </div>

              {/* AI reasoning */}
              <Card className="border-violet-200/30 dark:border-violet-800/30">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="h-4 w-4 text-violet-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {result.generatedPlan.reasoning}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Footer actions */}
        {!isGenerating && result && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={onDiscard}
              disabled={isAdopting}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              取消
            </Button>
            <Button
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
              onClick={onAdopt}
              disabled={isAdopting}
            >
              {isAdopting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5" />
              )}
              采纳方案
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
