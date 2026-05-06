import { AnalysisSheet } from "@/components/ai/analysis-sheet";
import { InlineAnalysis } from "@/components/ai/inline-analysis";
import { TagBadges, safeTags } from "@/components/tag-editor";
import { priorityColor } from "@/components/tag-filter-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import {
  useBatchAnalysis,
  useTriggerBatchAnalysis,
  useTriggerCaseAnalysis,
} from "@/hooks/use-ai";
import type { AnalysisStep, BatchAnalysis } from "@/types/ai";
import type {
  BatchRun,
  BatchRunResult,
  FailType,
  TestCase,
  TestCaseTags,
  TestResult,
} from "@nexqa/shared";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  Search,
  SkipForward,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";

// ── Helpers ─────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "-";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diff = e - s;
  if (diff < 1000) return `${diff}ms`;
  if (diff < 60000) return `${(diff / 1000).toFixed(1)}s`;
  return `${Math.floor(diff / 60000)}m ${Math.round((diff % 60000) / 1000)}s`;
}

function statusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-600" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "running":
      return "运行中";
    case "pending":
      return "等待中";
    default:
      return status;
  }
}

function failTypeLabel(ft: FailType): string {
  const map: Record<string, string> = {
    status_mismatch: "状态码不匹配",
    schema_violation: "Schema 违规",
    body_mismatch: "响应体不匹配",
    timeout: "超时",
    network_error: "网络错误",
    auth_failure: "认证失败",
    unknown: "未知",
    script_error: "脚本错误",
    variable_error: "变量错误",
    chain_dependency: "链路依赖",
  };
  return map[ft] || ft;
}

function failTypeColor(ft: FailType): string {
  switch (ft) {
    case "timeout":
    case "network_error":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
    case "auth_failure":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    default:
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  }
}

// ── Progress Bar Component ──────────────────────────

function PassRateBar({
  passed,
  failed,
  skipped,
  total,
}: {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
}) {
  if (total === 0) return null;
  const passedPct = (passed / total) * 100;
  const failedPct = (failed / total) * 100;
  const skippedPct = (skipped / total) * 100;
  return (
    <div className="space-y-1">
      <div className="flex h-2 rounded-full overflow-hidden bg-muted">
        {passedPct > 0 && (
          <div
            className="bg-green-500 transition-all"
            style={{ width: `${passedPct}%` }}
          />
        )}
        {failedPct > 0 && (
          <div
            className="bg-red-500 transition-all"
            style={{ width: `${failedPct}%` }}
          />
        )}
        {skippedPct > 0 && (
          <div
            className="bg-gray-400 transition-all"
            style={{ width: `${skippedPct}%` }}
          />
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          通过 {passed}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
          失败 {failed}
        </span>
        {skipped > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
            跳过 {skipped}
          </span>
        )}
        <span className="ml-auto font-medium">
          {total > 0 ? Math.round((passed / total) * 100) : 0}%
        </span>
      </div>
    </div>
  );
}

// ── BatchRun Detail View ────────────────────────────

interface BatchRunDetailData extends BatchRun {
  results: BatchRunResult[];
}

function BatchRunDetail({
  batchRunId,
  projectId,
  onBack,
}: {
  batchRunId: string;
  projectId: string;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [analysisSheetOpen, setAnalysisSheetOpen] = useState(false);

  // AI Analysis
  const { data: analysisData } = useBatchAnalysis(batchRunId);
  const triggerAnalysis = useTriggerBatchAnalysis();
  const triggerCaseAnalysis = useTriggerCaseAnalysis();

  const [analysisSteps, setAnalysisSteps] = useState<AnalysisStep[]>([
    { id: "collect", label: "收集失败用例数据", status: "waiting" },
    { id: "context", label: "读取 API 文档上下文", status: "waiting" },
    { id: "analyze", label: "AI 推理分析中...", status: "waiting" },
    { id: "suggest", label: "生成修复建议", status: "waiting" },
    { id: "action", label: "整理行动建议", status: "waiting" },
  ]);

  function handleBatchAnalysis() {
    setAnalysisSheetOpen(true);
    // Simulate step progress
    setAnalysisSteps((s) =>
      s.map((step, i) => ({
        ...step,
        status: i === 0 ? "running" : "waiting",
      })),
    );
    triggerAnalysis.mutate(batchRunId, {
      onSuccess: () => {
        setAnalysisSteps((s) =>
          s.map((step) => ({ ...step, status: "done" as const })),
        );
      },
    });
    // Simulate step progression
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step >= 5) {
        clearInterval(interval);
        return;
      }
      setAnalysisSteps((s) =>
        s.map((st, i) => ({
          ...st,
          status: i < step ? "done" : i === step ? "running" : "waiting",
        })),
      );
    }, 1500);
  }

  const { data: detail, isLoading } = useQuery<BatchRunDetailData>({
    queryKey: ["batch-run-detail", batchRunId],
    queryFn: () => api.get(`/batch-runs/detail?id=${batchRunId}`),
  });

  const { data: testResults = [] } = useQuery<(TestResult & { batchRunResultId: string })[]>({
    queryKey: ["batch-run-results", batchRunId],
    queryFn: () => api.get(`/batch-runs/results?id=${batchRunId}`),
    enabled: !!detail,
  });

  const { data: cases = [] } = useQuery<TestCase[]>({
    queryKey: ["test-cases", projectId],
    queryFn: () => api.get(`/test-cases?projectId=${projectId}`),
  });

  const caseMap = useMemo(() => {
    const map = new Map<string, TestCase>();
    for (const tc of cases) map.set(tc.id, tc);
    return map;
  }, [cases]);

  function toggleResult(id: string) {
    setExpandedResults((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isLoading || !detail) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {statusIcon(detail.status)}
            <h2 className="text-lg font-bold">{detail.name}</h2>
            <Badge variant="outline" className="text-xs">
              {statusLabel(detail.status)}
            </Badge>
            {/* AI Analysis button */}
            {detail.failedCases > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBatchAnalysis}
                disabled={triggerAnalysis.isPending}
                className="gap-1.5 ml-2"
              >
                {triggerAnalysis.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                )}
                AI 分析全部失败
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
            <span>{formatDate(detail.createdAt)}</span>
            <span>耗时 {formatDuration(detail.startedAt, detail.completedAt)}</span>
            <span>{detail.totalCases} 用例</span>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <PassRateBar
        passed={detail.passedCases}
        failed={detail.failedCases}
        skipped={detail.skippedCases}
        total={detail.totalCases}
      />

      {/* Failure breakdown */}
      {Object.keys(detail.failureBreakdown ?? {}).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(detail.failureBreakdown ?? {}).map(([type, count]) => (
            <Badge
              key={type}
              variant="outline"
              className={`text-xs ${failTypeColor(type as FailType)}`}
            >
              {failTypeLabel(type as FailType)} ×{count}
            </Badge>
          ))}
        </div>
      )}

      {/* Results list */}
      <div className="space-y-2">
        {testResults.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            暂无执行结果
          </p>
        )}
        {testResults.map((result) => {
          const tc = caseMap.get(result.caseId);
          const isExpanded = expandedResults.has(result.id);
          return (
            <div key={result.id} className="border rounded-lg overflow-hidden">
              <div
                className="flex items-center gap-3 w-full py-2 px-3 hover:bg-accent/50 cursor-pointer"
                onClick={() => toggleResult(result.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3 shrink-0" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0" />
                )}
                {result.passed ? (
                  <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                )}
                <span className="text-sm font-medium truncate flex-1">
                  {tc?.name || result.caseId}
                </span>
                {result.failType && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] h-5 ${failTypeColor(result.failType)}`}
                  >
                    {failTypeLabel(result.failType)}
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={
                    result.response.status < 400
                      ? "text-green-600 border-green-200 text-xs"
                      : "text-red-600 border-red-200 text-xs"
                  }
                >
                  {result.response.status}
                </Badge>
                <span className="text-xs text-muted-foreground shrink-0">
                  {result.response.duration}ms
                </span>
              </div>
              {isExpanded && (
                <div className="px-3 pb-3 space-y-3 border-t bg-muted/20">
                  {/* Tags */}
                  {tc && (
                    <div className="pt-2">
                      <TagBadges tags={safeTags(tc.tags)} />
                    </div>
                  )}
                  {result.failReason && (
                    <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950 rounded p-2">
                      <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                      {result.failReason}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      请求
                    </p>
                    <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-48">
                      {JSON.stringify(result.request, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      响应
                    </p>
                    <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-48">
                      {JSON.stringify(result.response, null, 2)}
                    </pre>
                  </div>
                  {tc?.endpointId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() =>
                        navigate({
                          to: "/p/$projectId/api",
                          params: { projectId },
                        })
                      }
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      查看用例 →
                    </Button>
                  )}
                  {/* Inline AI analysis for failed results */}
                  {!result.passed && (
                    <div className="pt-2 border-t">
                      <InlineAnalysis
                        analysis={
                          analysisData?.groups
                            ?.flatMap((g) => g.items)
                            ?.find((item) => item.resultId === result.id) ?? null
                        }
                        isAnalyzing={triggerCaseAnalysis.isPending}
                        onAnalyze={() =>
                          triggerCaseAnalysis.mutate(result.id)
                        }
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* AI Analysis Sheet */}
      <AnalysisSheet
        open={analysisSheetOpen}
        onOpenChange={setAnalysisSheetOpen}
        analysis={analysisData ?? null}
        isLoading={triggerAnalysis.isPending && !analysisData}
        analysisSteps={analysisSteps}
        onRetry={handleBatchAnalysis}
      />
    </div>
  );
}

// ── Main Page ───────────────────────────────────────

interface BatchRunListResponse {
  items: BatchRun[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export function ExecutionHistoryPage() {
  const { projectId } = useParams({ from: "/p/$projectId/history" });
  const navigate = useNavigate();
  const [selectedBatchRunId, setSelectedBatchRunId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<BatchRunListResponse>({
    queryKey: ["batch-runs", projectId, page],
    queryFn: () => api.get(`/batch-runs?projectId=${projectId}&page=${page}&pageSize=20`),
  });

  const batchRuns = data?.items ?? [];
  const pagination = data?.pagination;

  const filteredRuns = useMemo(() => {
    let filtered = batchRuns;
    if (statusFilter !== "all") {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((r) => (r.name || "").toLowerCase().includes(q));
    }
    return filtered;
  }, [batchRuns, statusFilter, searchQuery]);

  // If a batch run is selected, show detail view
  if (selectedBatchRunId) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <BatchRunDetail
          batchRunId={selectedBatchRunId}
          projectId={projectId}
          onBack={() => setSelectedBatchRunId(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">执行历史</h1>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="completed">已完成</SelectItem>
            <SelectItem value="failed">失败</SelectItem>
            <SelectItem value="running">运行中</SelectItem>
            <SelectItem value="pending">等待中</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索批次名..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-60 text-sm pl-8"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : batchRuns.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-12 w-12" />}
          title="还没有执行记录"
          description="执行测试用例后，BatchRun 结果将在这里展示"
          action={
            <Button
              onClick={() =>
                navigate({ to: "/p/$projectId/api", params: { projectId } })
              }
            >
              去测试用例
            </Button>
          }
        />
      ) : filteredRuns.length === 0 ? (
        <div className="text-center py-12">
          <Search className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">没有匹配的执行记录</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRuns.map((run) => {
            const passRate =
              run.totalCases > 0
                ? Math.round((run.passedCases / run.totalCases) * 100)
                : 0;
            return (
              <Card
                key={run.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedBatchRunId(run.id)}
              >
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {statusIcon(run.status)}
                      <CardTitle className="text-base">{run.name}</CardTitle>
                      <Badge variant="outline" className="text-xs">
                        {statusLabel(run.status)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(run.createdAt)}
                      </span>
                      <span className="font-medium">{passRate}%</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 px-4 pb-3">
                  <PassRateBar
                    passed={run.passedCases}
                    failed={run.failedCases}
                    skipped={run.skippedCases}
                    total={run.totalCases}
                  />
                  {/* Failure breakdown badges */}
                  {Object.keys(run.failureBreakdown ?? {}).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {Object.entries(run.failureBreakdown ?? {}).map(([type, count]) => (
                        <Badge
                          key={type}
                          variant="outline"
                          className={`text-[10px] h-5 ${failTypeColor(type as FailType)}`}
                        >
                          {failTypeLabel(type as FailType)} ×{count}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </Button>
              <span className="text-sm text-muted-foreground">
                第 {pagination.page} / {pagination.totalPages} 页
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
