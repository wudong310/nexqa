import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { MethodBadge } from "@/components/ui/method-badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type {
  GitSource,
  ScanChange,
  ScanRecord,
  ScanStatus,
} from "@nexqa/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  GitBranch,
  History,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Scan,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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

function shortHash(hash: string | null): string {
  if (!hash) return "-";
  return hash.slice(0, 7);
}

// ── Status Helpers ──────────────────────────────────

const SCAN_STATUS_CONFIG: Record<
  ScanStatus,
  { label: string; color: string; icon: React.ReactNode; animate?: boolean }
> = {
  pending: {
    label: "等待中",
    color:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    icon: <Clock className="h-3 w-3" />,
    animate: true,
  },
  cloning: {
    label: "克隆中",
    color:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    animate: true,
  },
  analyzing: {
    label: "分析中",
    color:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    animate: true,
  },
  importing: {
    label: "导入中",
    color:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    animate: true,
  },
  completed: {
    label: "已完成",
    color:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    icon: <CheckCircle className="h-3 w-3" />,
  },
  failed: {
    label: "失败",
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    icon: <XCircle className="h-3 w-3" />,
  },
};

function ScanStatusBadge({ status }: { status: ScanStatus }) {
  const config = SCAN_STATUS_CONFIG[status];
  return (
    <Badge
      variant="outline"
      className={`text-xs gap-1 ${config.color} ${config.animate ? "animate-pulse" : ""}`}
    >
      {config.icon}
      {config.label}
    </Badge>
  );
}

// ── Change Type Helpers ─────────────────────────────

const CHANGE_TYPE_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
  added: {
    label: "新增",
    color:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    icon: <Plus className="h-3 w-3" />,
  },
  updated: {
    label: "更新",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    icon: <RefreshCw className="h-3 w-3" />,
  },
  removed: {
    label: "删除",
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    icon: <Minus className="h-3 w-3" />,
  },
};

// ── Diff Summary Cards ──────────────────────────────

function DiffSummaryCards({
  added,
  updated,
  removed,
}: {
  added: number;
  updated: number;
  removed: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950 p-3">
        <Plus className="h-4 w-4 text-green-600" />
        <div>
          <p className="text-lg font-bold text-green-700 dark:text-green-300">
            {added}
          </p>
          <p className="text-xs text-green-600 dark:text-green-400">新增</p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950 p-3">
        <RefreshCw className="h-4 w-4 text-blue-600" />
        <div>
          <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
            {updated}
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400">更新</p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 p-3">
        <Minus className="h-4 w-4 text-red-600" />
        <div>
          <p className="text-lg font-bold text-red-700 dark:text-red-300">
            {removed}
          </p>
          <p className="text-xs text-red-600 dark:text-red-400">删除</p>
        </div>
      </div>
    </div>
  );
}

// ── Change Item Row ─────────────────────────────────

function ChangeItemRow({ change }: { change: ScanChange }) {
  const [expanded, setExpanded] = useState(false);
  const config = CHANGE_TYPE_CONFIG[change.type];
  const hasFields = change.type === "updated" && change.fields && change.fields.length > 0;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className={`flex items-center gap-2 px-3 py-2 ${hasFields ? "cursor-pointer hover:bg-accent/50" : ""}`}
        onClick={() => hasFields && setExpanded(!expanded)}
      >
        {hasFields && (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )
        )}
        <MethodBadge method={change.method} />
        <span
          className={`text-sm font-mono flex-1 ${change.type === "removed" ? "line-through text-muted-foreground" : ""}`}
        >
          {change.path}
        </span>
        <Badge
          variant="outline"
          className={`text-[10px] gap-1 ${config.color}`}
        >
          {config.icon}
          {config.label}
        </Badge>
      </div>
      {expanded && hasFields && (
        <div className="px-3 pb-3 border-t bg-muted/20">
          <table className="w-full text-xs mt-2">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left py-1 pr-4 font-medium">字段</th>
                <th className="text-left py-1 font-medium">变更详情</th>
              </tr>
            </thead>
            <tbody>
              {change.fields!.map((f, idx) => (
                <tr key={idx} className="border-t border-muted">
                  <td className="py-1.5 pr-4 font-mono text-foreground">
                    {f.field}
                  </td>
                  <td className="py-1.5 text-muted-foreground">{f.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── API Diff Panel ──────────────────────────────────

interface DiffResponse {
  changes: ScanChange[];
  summary: {
    added: number;
    updated: number;
    removed: number;
  };
}

function ApiDiffPanel({ gitSourceId }: { gitSourceId: string }) {
  const { data, isLoading, error } = useQuery<DiffResponse>({
    queryKey: ["git-source-diff", gitSourceId],
    queryFn: () => api.get(`/git-sources/${gitSourceId}/diff`),
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm">加载变更数据失败</p>
        <p className="text-xs">{(error as Error).message}</p>
      </div>
    );
  }

  if (!data || data.changes.length === 0) {
    return (
      <EmptyState
        icon={<RefreshCw className="h-10 w-10" />}
        title="暂无 API 变更"
        description="完成一次扫描后，这里会展示 API 变更列表"
        className="py-8"
      />
    );
  }

  return (
    <div className="space-y-4 p-4">
      <DiffSummaryCards
        added={data.summary.added}
        updated={data.summary.updated}
        removed={data.summary.removed}
      />
      <div className="space-y-2">
        {data.changes.map((change, idx) => (
          <ChangeItemRow key={`${change.method}-${change.path}-${idx}`} change={change} />
        ))}
      </div>
    </div>
  );
}

// ── Scan Record Detail ──────────────────────────────

function ScanRecordDetail({ record }: { record: ScanRecord }) {
  const result = record.result;

  return (
    <div className="space-y-4 p-4 border-t bg-muted/10">
      {record.error && (
        <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950 rounded p-3">
          <AlertCircle className="h-3.5 w-3.5 inline mr-1.5" />
          {record.error}
        </div>
      )}
      {result && (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">发现 API</p>
              <p className="font-medium">{result.endpointsFound}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">扫描文件数</p>
              <p className="font-medium">{record.totalFilesFound}</p>
            </div>
          </div>
          <DiffSummaryCards
            added={result.endpointsNew}
            updated={result.endpointsUpdated}
            removed={result.endpointsRemoved}
          />
          {result.changes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                变更列表
              </p>
              {result.changes.map((change, idx) => (
                <ChangeItemRow
                  key={`${change.method}-${change.path}-${idx}`}
                  change={change}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Scan Records List ───────────────────────────────

interface ScanRecordListResponse {
  items: ScanRecord[];
  total: number;
}

function ScanRecordsList({ gitSourceId }: { gitSourceId: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<ScanRecordListResponse>({
    queryKey: ["scan-records", gitSourceId],
    queryFn: () =>
      api.get(`/scan-records?gitSourceId=${gitSourceId}&limit=20&offset=0`),
  });

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm">加载扫描记录失败</p>
        <p className="text-xs">{(error as Error).message}</p>
      </div>
    );
  }

  const records = data?.items ?? [];

  if (records.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-10 w-10" />}
        title="暂无扫描记录"
        description="触发一次扫描后，扫描记录会在这里展示"
        className="py-8"
      />
    );
  }

  return (
    <div className="space-y-2 p-4">
      {records.map((record) => {
        const isExpanded = expandedId === record.id;
        const resultSummary = record.result
          ? `+${record.result.endpointsNew} ~${record.result.endpointsUpdated} -${record.result.endpointsRemoved}`
          : null;

        return (
          <Collapsible
            key={record.id}
            open={isExpanded}
            onOpenChange={() =>
              setExpandedId(isExpanded ? null : record.id)
            }
          >
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-3 border rounded-lg px-3 py-2 hover:bg-accent/50 cursor-pointer">
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3 shrink-0" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0" />
                )}
                <ScanStatusBadge status={record.status} />
                <span className="text-xs text-muted-foreground">
                  {formatDate(record.startedAt)}
                </span>
                {record.commitHash && (
                  <code className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                    {shortHash(record.commitHash)}
                  </code>
                )}
                {resultSummary && (
                  <span className="text-xs font-mono ml-auto text-muted-foreground">
                    {resultSummary}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDuration(record.startedAt, record.completedAt)}
                </span>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScanRecordDetail record={record} />
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

// ── Scan Polling Hook ───────────────────────────────

function useScanPolling(scanRecordId: string | null, onComplete: () => void) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!scanRecordId) {
      cleanup();
      return;
    }

    const poll = async () => {
      try {
        const record = await api.get<ScanRecord>(
          `/scan-records/${scanRecordId}`,
        );
        if (record.status === "completed" || record.status === "failed") {
          cleanup();
          onComplete();
          if (record.status === "completed") {
            toast.success("扫描完成", {
              description: record.result
                ? `发现 ${record.result.endpointsFound} 个 API（+${record.result.endpointsNew} ~${record.result.endpointsUpdated} -${record.result.endpointsRemoved}）`
                : undefined,
            });
          } else {
            toast.error("扫描失败", {
              description: record.error ?? "未知错误",
            });
          }
        }
      } catch {
        // Polling errors are non-fatal; will retry next interval
      }
    };

    intervalRef.current = setInterval(poll, 3000);

    return cleanup;
  }, [scanRecordId, onComplete, cleanup]);

  return cleanup;
}

// ── Git Source Card ─────────────────────────────────

function GitSourceCard({ source }: { source: GitSource }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("info");
  const [pollingScanId, setPollingScanId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handlePollComplete = useCallback(() => {
    setPollingScanId(null);
    queryClient.invalidateQueries({
      queryKey: ["scan-records", source.id],
    });
    queryClient.invalidateQueries({
      queryKey: ["git-source-diff", source.id],
    });
    queryClient.invalidateQueries({
      queryKey: ["git-sources"],
    });
  }, [queryClient, source.id]);

  useScanPolling(pollingScanId, handlePollComplete);

  const scanMutation = useMutation({
    mutationFn: () =>
      api.post<ScanRecord>(`/git-sources/${source.id}/scan`, {}),
    onSuccess: (record) => {
      toast.info("扫描已触发", { description: `正在扫描 ${source.name}...` });
      setPollingScanId(record.id);
    },
    onError: (err) => {
      toast.error("触发扫描失败", { description: (err as Error).message });
    },
  });

  const isScanning = scanMutation.isPending || pollingScanId !== null;

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
              <CardTitle className="text-base truncate">
                {source.name}
              </CardTitle>
              <Badge variant="outline" className="text-xs shrink-0">
                {source.branch}
              </Badge>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setSheetOpen(true);
                  setActiveTab("records");
                }}
              >
                <History className="h-3.5 w-3.5" />
                查看记录
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => scanMutation.mutate()}
                disabled={isScanning}
              >
                {isScanning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Scan className="h-3.5 w-3.5" />
                )}
                {isScanning ? "扫描中..." : "扫描"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 px-4 pb-3">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="font-mono truncate max-w-[300px]">
              {source.repoUrl}
            </span>
            {source.lastScanAt && (
              <span className="shrink-0">
                上次扫描：{formatDate(source.lastScanAt)}
              </span>
            )}
            {source.scanConfig.framework !== "auto" && (
              <Badge variant="outline" className="text-[10px]">
                {source.scanConfig.framework}
              </Badge>
            )}
          </div>
          {pollingScanId && (
            <div className="mt-2 flex items-center gap-2 text-xs text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-950 rounded px-2 py-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>扫描进行中，每 3 秒自动刷新状态...</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              {source.name}
            </SheetTitle>
            <SheetDescription>
              {source.repoUrl} · {source.branch}
            </SheetDescription>
          </SheetHeader>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="mt-4"
          >
            <TabsList className="mx-4">
              <TabsTrigger value="info">配置</TabsTrigger>
              <TabsTrigger value="records">扫描记录</TabsTrigger>
              <TabsTrigger value="diff">API 变更</TabsTrigger>
            </TabsList>

            <TabsContent value="info">
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">仓库地址</p>
                    <p className="font-mono text-xs break-all">
                      {source.repoUrl}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">分支</p>
                    <p className="font-medium">{source.branch}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">认证方式</p>
                    <p className="font-medium">{source.auth.type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">框架</p>
                    <p className="font-medium">
                      {source.scanConfig.framework}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    扫描路径
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {source.scanConfig.includePaths.map((p) => (
                      <Badge
                        key={p}
                        variant="outline"
                        className="text-[10px] font-mono"
                      >
                        {p}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    排除路径
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {source.scanConfig.excludePaths.map((p) => (
                      <Badge
                        key={p}
                        variant="outline"
                        className="text-[10px] font-mono text-muted-foreground"
                      >
                        {p}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="records">
              <ScanRecordsList gitSourceId={source.id} />
            </TabsContent>

            <TabsContent value="diff">
              <ApiDiffPanel gitSourceId={source.id} />
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ── Loading Skeleton ────────────────────────────────

function GitSourceCardSkeleton() {
  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3">
        <Skeleton className="h-4 w-64" />
      </CardContent>
    </Card>
  );
}

// ── Main Page ───────────────────────────────────────

interface GitSourceListResponse {
  items: GitSource[];
}

export function GitSourcesPage() {
  const { projectId } = useParams({ from: "/p/$projectId/git-sources" });

  const { data, isLoading, error } = useQuery<GitSourceListResponse>({
    queryKey: ["git-sources", projectId],
    queryFn: () => api.get(`/git-sources?projectId=${projectId}`),
  });

  const sources = data?.items ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Git Sources</h1>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <GitSourceCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <p className="text-sm font-medium">加载 Git Sources 失败</p>
          <p className="text-xs">{(error as Error).message}</p>
        </div>
      ) : sources.length === 0 ? (
        <EmptyState
          icon={<GitBranch className="h-12 w-12" />}
          title="还没有配置 Git Source"
          description="添加一个 Git 仓库源，自动扫描代码中的 API 端点"
        />
      ) : (
        <div className="space-y-3">
          {sources.map((source) => (
            <GitSourceCard key={source.id} source={source} />
          ))}
        </div>
      )}
    </div>
  );
}
