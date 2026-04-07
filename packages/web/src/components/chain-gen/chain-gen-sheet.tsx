import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useChainGenAdopt,
  useChainGenAnalyze,
  useChainGenStatus,
} from "@/hooks/use-chain-gen";
import type { ChainGenerationResult } from "@/types/chain-gen";
import {
  AlertTriangle,
  CheckCircle,
  Inbox,
  Loader2,
  RefreshCw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ChainGenProgress } from "./analysis-progress";
import { DependencyView } from "./dependency-group-card";
import { GeneratedChainCard } from "./generated-chain-card";
import { toast } from "sonner";

interface ChainGenSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Navigate to chain editor for a specific chain after adopt */
  onEditChain?: (chainId: string) => void;
  onError?: (error: Error) => void;
}

type Phase = "idle" | "analyzing" | "result";

export function ChainGenSheet({
  open,
  onOpenChange,
  projectId,
  onEditChain,
  onError: _onError,
}: ChainGenSheetProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [taskId, setTaskId] = useState<string | undefined>();
  const [result, setResult] = useState<ChainGenerationResult | undefined>();
  const [activeTab, setActiveTab] = useState("chains");

  // Hooks
  const analyzeMutation = useChainGenAnalyze(projectId);
  const adoptMutation = useChainGenAdopt(projectId);
  const { data: statusData } = useChainGenStatus(
    phase === "analyzing" ? taskId : undefined,
  );

  // Watch status polling → transition to result
  if (
    phase === "analyzing" &&
    statusData?.status === "completed" &&
    statusData.result &&
    !result
  ) {
    setResult(statusData.result);
    setPhase("result");
  }

  // ── Actions ─────────────────────────────────────

  const handleStart = useCallback(() => {
    setResult(undefined);
    setPhase("analyzing");
    analyzeMutation.mutate(
      { scope: "all" },
      {
        onSuccess: (data) => {
          setTaskId(data.taskId);
        },
        onError: (error) => {
          setPhase("idle");
          toast.error(
            `测试链分析失败: ${error instanceof Error ? error.message : "未知错误"}`,
          );
        },
      },
    );
  }, [analyzeMutation]);

  const handleRegenerate = useCallback(() => {
    setResult(undefined);
    setPhase("analyzing");
    analyzeMutation.mutate(
      { scope: "all", force: true },
      {
        onSuccess: (data) => {
          setTaskId(data.taskId);
        },
        onError: (error) => {
          setPhase("idle");
          toast.error(
            `测试链分析失败: ${error instanceof Error ? error.message : "未知错误"}`,
          );
        },
      },
    );
  }, [analyzeMutation]);

  const handleAdoptAll = useCallback(() => {
    if (!result) return;
    const indexes = result.generatedChains.map((_, i) => i);
    adoptMutation.mutate(
      { generationId: result.id, chainIndexes: indexes },
      {
        onSuccess: () => {
          toast.success(`已采纳 ${result.generatedChains.length} 条测试链`);
          onOpenChange(false);
          // Reset state for next open
          setPhase("idle");
          setResult(undefined);
          setTaskId(undefined);
        },
        onError: (error) => {
          toast.error(
            `采纳失败: ${error instanceof Error ? error.message : "未知错误"}`,
          );
        },
      },
    );
  }, [result, adoptMutation, onOpenChange]);

  const handleDiscard = useCallback(() => {
    onOpenChange(false);
    setPhase("idle");
    setResult(undefined);
    setTaskId(undefined);
  }, [onOpenChange]);

  const handleEditChain = useCallback(
    (_chainIndex: number) => {
      // For now, adopt all then navigate. In the future, could adopt single.
      if (!result) return;
      const indexes = result.generatedChains.map((_, i) => i);
      adoptMutation.mutate(
        { generationId: result.id, chainIndexes: indexes },
        {
          onSuccess: (data) => {
            toast.success("测试链已采纳");
            onOpenChange(false);
            setPhase("idle");
            setResult(undefined);
            setTaskId(undefined);
            // Navigate to the chain editor for that specific chain
            if (onEditChain && data.adopted[_chainIndex]) {
              onEditChain(data.adopted[_chainIndex].chainId);
            }
          },
          onError: (error) => {
            toast.error(
              `采纳失败: ${error instanceof Error ? error.message : "未知错误"}`,
            );
          },
        },
      );
    },
    [result, adoptMutation, onOpenChange, onEditChain],
  );

  // Auto-start on open
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open && phase === "idle") {
        handleStart();
      }
      if (!open) {
        // Allow closing during result, but reset on next open
        onOpenChange(false);
      } else {
        onOpenChange(true);
      }
    },
    [phase, handleStart, onOpenChange],
  );

  // ── Computed ────────────────────────────────────

  const warningCount =
    result?.generatedChains.reduce(
      (sum, chain) =>
        sum + chain.steps.filter((s) => s.confidence < 0.8).length,
      0,
    ) ?? 0;

  const isFailed = phase === "analyzing" && statusData?.status === "failed";

  // Toast on failure from status polling
  useEffect(() => {
    if (isFailed) {
      toast.error(statusData?.error ?? "分析失败，请重试");
    }
  }, [isFailed, statusData?.error]);

  const hasChains = (result?.generatedChains?.length ?? 0) > 0;

  // ── Render ──────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-[600px] sm:max-w-[600px] flex flex-col" side="right">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            AI 生成测试链
          </SheetTitle>
          <SheetDescription>
            {phase === "analyzing" && "AI 正在分析 API 文档中的数据依赖关系"}
            {phase === "result" &&
              result &&
              `识别到 ${result.dependencyGraph.edges.length} 条数据依赖，已生成 ${result.generatedChains.length} 条测试链`}
            {phase === "idle" && "分析 API 间的数据依赖，自动编排测试链"}
          </SheetDescription>
        </SheetHeader>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Analyzing phase */}
          {phase === "analyzing" && !isFailed && (
            <ChainGenProgress statusData={statusData} />
          )}

          {/* Failed state */}
          {isFailed && (
            <div className="flex flex-col items-center gap-3 py-8">
              <XCircle className="h-10 w-10 text-destructive" />
              <p className="text-sm text-destructive">
                {statusData?.error ?? "分析失败，请重试"}
              </p>
              <Button variant="outline" size="sm" onClick={handleRegenerate}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                重试
              </Button>
            </div>
          )}

          {/* Result phase — has chains */}
          {phase === "result" && result && hasChains && (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full">
                <TabsTrigger value="chains" className="flex-1">
                  生成的链 ({result.generatedChains.length})
                </TabsTrigger>
                <TabsTrigger value="deps" className="flex-1">
                  依赖关系
                </TabsTrigger>
              </TabsList>

              <TabsContent value="chains" className="space-y-3 mt-3">
                {result.generatedChains.map((chain, i) => (
                  <GeneratedChainCard
                    key={`chain-${i}`}
                    chain={chain}
                    index={i}
                    onEdit={() => handleEditChain(i)}
                  />
                ))}
              </TabsContent>

              <TabsContent value="deps" className="mt-3">
                <DependencyView graph={result.dependencyGraph} />
              </TabsContent>
            </Tabs>
          )}

          {/* Result phase — empty (no chains generated) */}
          {phase === "result" && result && !hasChains && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <Inbox className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold">未发现可生成的测试链</h3>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-[320px]">
                  当前项目的 API 之间未发现明显的数据依赖关系，请确认已添加足够的 API 端点
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerate}
                disabled={analyzeMutation.isPending}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                重新分析
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === "result" && result && hasChains && (
          <div className="flex items-center justify-between px-4 py-3 border-t shrink-0">
            <div className="flex items-center gap-2">
              {warningCount > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {warningCount} 个步骤置信度 &lt; 80%，建议审核
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerate}
                disabled={analyzeMutation.isPending}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                重新生成
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDiscard}
              >
                全部丢弃
              </Button>
              <Button
                size="sm"
                className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
                onClick={handleAdoptAll}
                disabled={adoptMutation.isPending}
              >
                {adoptMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="h-3.5 w-3.5" />
                )}
                采纳全部 ({result.generatedChains.length} 条链)
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
