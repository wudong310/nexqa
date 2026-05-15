/**
 * PlanGenV2Dialog — V2 方案生成 Dialog
 *
 * 功能：
 * - 输入生成意图（intent）
 * - 选择范围（全部端点 / 仅变更端点）
 * - 触发 POST API 开始生成
 * - 轮询 GET API 直到完成/失败
 * - 展示结果：方案名称/描述/reasoning + 采纳按钮
 * - 失败展示错误信息
 * - generating 阶段关闭不重置状态
 */

import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type {
  PollPlanGenV2Response,
  PlanGenV2Result,
  StartPlanGenV2Request,
  StartPlanGenV2Response,
} from "@/types/plan-gen-v2";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlanGenV2WS } from "@/hooks/usePlanGenV2WS";
import {
  CheckCircle,
  Lightbulb,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// ── Types ───────────────────────────────────────────

type ScopeChoice = "all" | "changed";

interface PlanGenV2DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** 第一个 OpenClaw 连接 ID（从项目配置自动获取） */
  openclawConnectionId: string | null;
}

// ── Component ───────────────────────────────────────

export function PlanGenV2Dialog({
  open,
  onOpenChange,
  projectId,
  openclawConnectionId,
}: PlanGenV2DialogProps) {
  const queryClient = useQueryClient();

  // Form state
  const [intent, setIntent] = useState("");
  const [scope, setScope] = useState<ScopeChoice>("all");

  // Generation state
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [result, setResult] = useState<PlanGenV2Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"input" | "generating" | "completed" | "failed">("input");

  // ── WebSocket streaming logs ──────────────────────

  const { logs } = usePlanGenV2WS(generationId);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logsEndRef.current && logs.length > 0) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // ── Start generation mutation ──────────────────────

  const startMutation = useMutation({
    mutationFn: (req: StartPlanGenV2Request) =>
      api.post<StartPlanGenV2Response>(
        `/projects/${projectId}/plan-gen-v2`,
        req,
      ),
    onSuccess: (data) => {
      setGenerationId(data.id);
      setPhase("generating");
    },
    onError: (err: Error) => {
      setError(err.message);
      setPhase("failed");
    },
  });

  // ── Poll generation status ─────────────────────────

  const pollQuery = useQuery<PollPlanGenV2Response>({
    queryKey: ["plan-gen-v2", "poll", generationId],
    queryFn: () => api.get(`/plan-generations-v2/${generationId}`),
    enabled: phase === "generating" && !!generationId,
    refetchInterval: 2000,
    refetchIntervalInBackground: false,
  });

  // Sync poll result to state (avoid side effects in select)
  useEffect(() => {
    const data = pollQuery.data;
    if (!data || phase !== "generating") return;

    if (data.status === "completed") {
      setResult(data.result ?? null);
      setPhase("completed");
    } else if (data.status === "failed") {
      setError(data.error ?? null);
      setPhase("failed");
    }
  }, [pollQuery.data, phase]);

  // ── Handlers ───────────────────────────────────────

  const handleStart = useCallback(() => {
    if (!intent.trim()) {
      toast.error("请输入生成意图");
      return;
    }
    if (!openclawConnectionId) {
      toast.error("项目未配置 OpenClaw 连接，请先在项目设置中配置");
      return;
    }

    setError(null);
    setResult(null);
    startMutation.mutate({
      intent: intent.trim(),
      scope: { changedOnly: scope === "changed" },
      openclawConnectionId,
    });
  }, [intent, scope, openclawConnectionId, startMutation]);

  const handleAdopt = useCallback(() => {
    if (!result || !generationId) return;
    // 调用 adopt API
    api
      .post<{ planId: string; plan: { name: string } }>(
        `/plan-generations-v2/${generationId}/adopt`,
        { name: result.plan.name, description: result.plan.description }
      )
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["test-plans", projectId] });
        queryClient.invalidateQueries({ queryKey: ["plan-gen-records", projectId] });
        toast.success(`方案「${result.plan.name}」已采纳`);
        handleReset();
        onOpenChange(false);
      })
      .catch((err: Error) => {
        toast.error(`采纳失败：${err.message}`);
      });
  }, [result, generationId, queryClient, projectId, onOpenChange]);

  const handleReset = useCallback(() => {
    setIntent("");
    setScope("all");
    setGenerationId(null);
    setResult(null);
    setError(null);
    setPhase("input");
  }, []);

  const handleClose = useCallback(
    (isOpen: boolean) => {
      if (!isOpen && phase === "generating") {
        // generating 阶段关闭不重置，保留 generationId 和 state
        onOpenChange(false);
      } else if (!isOpen) {
        handleReset();
        onOpenChange(false);
      } else {
        onOpenChange(true);
      }
    },
    [phase, onOpenChange, handleReset],
  );

  // ── Render ─────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            AI 智能生成方案 (V2)
          </DialogTitle>
          <DialogDescription>
            基于 OpenClaw Agent 深度分析项目 API，智能生成测试方案
          </DialogDescription>
        </DialogHeader>

        {/* ── Input Phase ── */}
        {phase === "input" && (
          <div className="space-y-4 py-2">
            {/* Intent */}
            <div className="space-y-2">
              <label className="text-sm font-medium">生成意图</label>
              <Textarea
                placeholder="如：发版前回归测试、核心支付流程冒烟、新增接口覆盖..."
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Scope */}
            <div className="space-y-2">
              <label className="text-sm font-medium">端点范围</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={scope === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setScope("all")}
                >
                  全部端点
                </Button>
                <Button
                  type="button"
                  variant={scope === "changed" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setScope("changed")}
                >
                  仅变更端点
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {scope === "all"
                  ? "分析项目所有 API 端点"
                  : "仅分析近期有变更的端点（适合增量回归）"}
              </p>
            </div>

            {/* No connection warning */}
            {!openclawConnectionId && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  ⚠️ 项目未配置 OpenClaw 连接。请先在「项目设置 → OpenClaw」中添加连接后再使用 V2 生成。
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Generating Phase ── */}
        {phase === "generating" && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
              <p className="text-sm font-medium">正在生成测试方案...</p>
            </div>

            {/* Streaming logs */}
            <div className="font-mono text-xs bg-muted/30 rounded-md p-3 max-h-[240px] overflow-y-auto space-y-1">
              {logs.length === 0 ? (
                <p className="text-muted-foreground">等待 Agent 响应...</p>
              ) : (
                logs.map((log, i) => {
                  switch (log.event) {
                    case "delta":
                      return (
                        <p key={i} className="text-muted-foreground">
                          {log.text}
                        </p>
                      );
                    case "tool_use":
                      return (
                        <p key={i} className="text-amber-600 dark:text-amber-400">
                          🔧 调用 <span className="font-semibold">{log.text}</span>
                        </p>
                      );
                    case "tool_result":
                      return (
                        <p key={i} className="text-emerald-600 dark:text-emerald-400">
                          ✅ <span className="font-semibold">{log.text}</span> 完成
                        </p>
                      );
                    case "error":
                      return (
                        <p key={i} className="text-destructive">
                          ❌ {log.text}
                        </p>
                      );
                    case "final":
                      return (
                        <p key={i} className="text-violet-600 dark:text-violet-400 font-medium">
                          ✓ {log.text}
                        </p>
                      );
                    default:
                      return null;
                  }
                })
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* ── Failed Phase ── */}
        {phase === "failed" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <XCircle className="h-10 w-10 text-destructive" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-destructive">生成失败</p>
              <p className="text-xs text-muted-foreground max-w-[360px]">
                {error || "未知错误，请重试"}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleReset}>
              返回重试
            </Button>
          </div>
        )}

        {/* ── Completed Phase ── */}
        {phase === "completed" && result && (
          <div className="space-y-4 py-2 max-h-[400px] overflow-y-auto">
            {/* Parsed intent */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">
                {result.parsedIntent.type}
              </Badge>
              <Badge variant="outline" className="text-xs">
                范围: {result.parsedIntent.scope}
              </Badge>
              {result.parsedIntent.urgency === "quick" && (
                <Badge variant="secondary" className="text-xs">
                  ⚡ 快速
                </Badge>
              )}
            </div>

            {/* Plan overview */}
            <Card>
              <CardContent className="pt-4 space-y-2">
                <h3 className="text-base font-semibold">
                  📋 {result.plan.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {result.plan.description}
                </p>
              </CardContent>
            </Card>

            {/* Stages summary */}
            {result.plan.stages.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  阶段 ({result.plan.stages.length})
                </h4>
                <div className="space-y-1">
                  {result.plan.stages.map((stage, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs p-2 rounded bg-muted/50"
                    >
                      <span className="font-mono text-muted-foreground">
                        {i + 1}.
                      </span>
                      <span className="font-medium">{stage.name}</span>
                      {stage.gate && (
                        <Badge variant="outline" className="text-[10px] h-4">
                          门禁
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Execution config */}
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">
                并发: {result.plan.execution.concurrency}
              </Badge>
              <Badge variant="secondary">
                重试: {result.plan.execution.retryOnFail}次
              </Badge>
              <Badge variant="secondary">
                超时: {result.plan.execution.timeoutMs / 1000}s
              </Badge>
              {result.plan.execution.stopOnGateFail && (
                <Badge variant="secondary">门禁失败停止</Badge>
              )}
            </div>

            {/* Reasoning */}
            <Card className="border-violet-200/30 dark:border-violet-800/30">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-start gap-2">
                  <Lightbulb className="h-4 w-4 text-violet-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {result.plan.reasoning}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Footer ── */}
        <DialogFooter>
          {phase === "input" && (
            <Button
              onClick={handleStart}
              disabled={!intent.trim() || !openclawConnectionId || startMutation.isPending}
              className="gap-1.5"
            >
              {startMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              开始生成
            </Button>
          )}
          {phase === "completed" && (
            <>
              <Button variant="outline" onClick={handleReset}>
                重新生成
              </Button>
              <Button
                onClick={handleAdopt}
                className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
              >
                <CheckCircle className="h-4 w-4" />
                采纳方案
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}