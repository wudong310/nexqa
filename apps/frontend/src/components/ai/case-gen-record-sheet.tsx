/**
 * CaseGenRecordSheet — 生成记录右侧抽屉
 *
 * 对标 PlanGenRecordSheet，展示所有生成记录及其执行日志
 */

import { useCaseGenTasks } from "@/hooks/use-case-gen-v2";
import type { CaseGenTask, LogEntry } from "@/types/case-gen-v2";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  History,
} from "lucide-react";
import { useState } from "react";

// ── Status Badge ────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
    pending: {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />,
      label: "等待中",
      className: "text-slate-600 dark:text-slate-400",
    },
    generating: {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />,
      label: "生成中",
      className: "text-violet-600 dark:text-violet-400",
    },
    completed: {
      icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
      label: "已完成",
      className: "text-emerald-600 dark:text-emerald-400",
    },
    failed: {
      icon: <XCircle className="h-3.5 w-3.5 text-red-500" />,
      label: "失败",
      className: "text-red-600 dark:text-red-400",
    },
  };

  const c = config[status] || config.pending;
  return (
    <div className={cn("flex items-center gap-1", c.className)}>
      {c.icon}
      <span className="text-xs font-medium">{c.label}</span>
    </div>
  );
}

// ── Log Entry Renderer ──────────────────────────────

function LogEntryRow({ log }: { log: LogEntry }) {
  switch (log.event) {
    case "delta":
      return <p className="text-muted-foreground">{log.text}</p>;
    case "tool_use":
      return (
        <p className="text-amber-600 dark:text-amber-400">
          🔧 调用 <span className="font-semibold">{log.text}</span>
        </p>
      );
    case "tool_result":
      return (
        <p className="text-emerald-600 dark:text-emerald-400">
          ✅ <span className="font-semibold">{log.text}</span> 完成
        </p>
      );
    case "error":
      return <p className="text-destructive">❌ {log.text}</p>;
    case "final":
      return (
        <p className="text-violet-600 dark:text-violet-400 font-medium">
          ✓ {log.text}
        </p>
      );
    default:
      return null;
  }
}

// ── Record Detail ───────────────────────────────────

function RecordDetail({ record }: { record: CaseGenTask }) {
  const logs: LogEntry[] = record.logs ?? [];

  return (
    <div className="space-y-3 p-4 border-t bg-muted/10">
      {/* Error */}
      {record.error && (
        <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950 rounded p-3">
          ❌ {record.error}
        </div>
      )}

      {/* Result stats */}
      {record.result && (
        <div className="text-sm">
          <span className="text-muted-foreground">生成用例：</span>
          <span className="font-medium">{record.result.stats.total}</span> 条
        </div>
      )}

      {/* Logs */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">执行日志</p>
        <div className="font-mono text-xs bg-muted/30 rounded-md p-3 max-h-[300px] overflow-y-auto space-y-1">
          {logs.length === 0 ? (
            <p className="text-muted-foreground">暂无日志</p>
          ) : (
            logs.map((log, i) => <LogEntryRow key={i} log={log} />)
          )}
        </div>
      </div>
    </div>
  );
}

// ── Time Helpers ────────────────────────────────────

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  return `${diffDays}天前`;
}

function formatDuration(start: string, end?: string | null): string {
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  const diffMs = endDate.getTime() - startDate.getTime();
  const secs = Math.floor(diffMs / 1000);
  const mins = Math.floor(secs / 60);

  if (mins > 0) {
    const remainSecs = secs % 60;
    return `${mins}m${remainSecs}s`;
  }
  return `${secs}s`;
}

// ── Records List ────────────────────────────────────

function RecordsList({ projectId }: { projectId: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading, error } = useCaseGenTasks(projectId);

  const records = data?.records ?? [];

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
        <XCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm">加载生成记录失败</p>
        <p className="text-xs">{(error as Error).message}</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-10 w-10" />}
        title="暂无生成记录"
        description="触发 AI 生成后，记录会在这里展示"
        className="py-8"
      />
    );
  }

  return (
    <div className="space-y-2 p-4">
      {records.map((record) => {
        const isExpanded = expandedId === record.id;
        const intent = `${record.endpointIds.length} 个端点`;

        return (
          <Collapsible
            key={record.id}
            open={isExpanded}
            onOpenChange={() => setExpandedId(isExpanded ? null : record.id)}
          >
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-3 border rounded-lg px-3 py-2 hover:bg-accent/50 cursor-pointer">
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3 shrink-0" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0" />
                )}
                <StatusBadge status={record.status} />
                <span className="text-sm truncate flex-1" title={intent}>
                  {intent}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatRelative(record.startedAt)}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDuration(record.startedAt, record.completedAt)}
                </span>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <RecordDetail record={record} />
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

// ── Main Sheet ──────────────────────────────────────

interface CaseGenRecordSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function CaseGenRecordSheet({
  open,
  onOpenChange,
  projectId,
}: CaseGenRecordSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[520px]">
        <SheetHeader>
          <SheetTitle>生成记录</SheetTitle>
          <SheetDescription>查看 AI 生成测试用例的历史记录</SheetDescription>
        </SheetHeader>
        <RecordsList projectId={projectId} />
      </SheetContent>
    </Sheet>
  );
}