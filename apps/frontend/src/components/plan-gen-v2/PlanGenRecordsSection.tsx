/**
 * PlanGenRecordsSection — AI 生成记录区域
 *
 * 展示 4 种状态记录卡片：
 * - generating: 进行中
 * - completed_pending: 已完成待采纳
 * - completed_adopted: 已采纳
 * - failed: 失败
 *
 * 默认收起，展开显示最近 3 条
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAdoptPlanGen,
  useDiscardPlanGen,
  usePlanGenRecords,
} from "@/hooks/usePlanGenRecords";
import type { PlanGenRecord, PlanGenRecordStatus } from "@/types/plan-gen-v2";
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

// ── Types ───────────────────────────────────────────

interface PlanGenRecordsSectionProps {
  projectId: string;
  onOpenV2Dialog: () => void;
  onAdopt: (record: PlanGenRecord) => void;
  onRetry: (record: PlanGenRecord) => void;
}

// ── Helpers ─────────────────────────────────────────

function formatElapsedTime(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const diffMs = now - start;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffHour > 0) {
    return `${diffHour}h ${diffMin % 60}m`;
  } else if (diffMin > 0) {
    return `${diffMin}m ${diffSec % 60}s`;
  } else {
    return `${diffSec}s`;
  }
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr).getTime();
  const now = Date.now();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 0) {
    return `${diffDay}天前`;
  } else if (diffHour > 0) {
    return `${diffHour}小时前`;
  } else if (diffMin > 0) {
    return `${diffMin}分钟前`;
  } else {
    return "刚刚";
  }
}

// ── Sub-components ──────────────────────────────────

function GeneratingRecord({
  record,
  onViewProgress,
}: {
  record: PlanGenRecord;
  onViewProgress: () => void;
}) {
  const [elapsed, setElapsed] = useState(() =>
    formatElapsedTime(record.startedAt)
  );

  // Update elapsed time every second
  useState(() => {
    const timer = setInterval(() => {
      setElapsed(formatElapsedTime(record.startedAt));
    }, 1000);
    return () => clearInterval(timer);
  });

  return (
    <div className="flex items-center gap-3 p-3 rounded-md bg-violet-50/50 dark:bg-violet-950/20">
      <Loader2 className="h-4 w-4 animate-spin text-violet-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{record.intent}</p>
        <p className="text-xs text-muted-foreground">已耗时 {elapsed}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="text-xs shrink-0"
        onClick={onViewProgress}
      >
        查看进度
      </Button>
    </div>
  );
}

function PendingAdoptRecord({
  record,
  onAdopt,
  onDiscard,
}: {
  record: PlanGenRecord;
  onAdopt: () => void;
  onDiscard: () => void;
}) {
  const plan = record.result?.plan;
  const stageCount = plan?.stages?.length ?? 0;

  return (
    <div className="p-3 rounded-md bg-emerald-50/50 dark:bg-emerald-950/20 space-y-2">
      <div className="flex items-start gap-2">
        <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {plan?.name ?? record.intent}
          </p>
          {plan?.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {plan.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {stageCount > 0 && (
          <Badge variant="outline" className="text-[10px] h-5">
            {stageCount} 阶段
          </Badge>
        )}
        <span className="text-[10px] text-muted-foreground">
          生成于 {formatRelativeTime(record.startedAt)}
        </span>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="bg-violet-600 hover:bg-violet-700 text-white text-xs"
          onClick={onAdopt}
        >
          采纳
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={onDiscard}
        >
          丢弃
        </Button>
      </div>
    </div>
  );
}

function AdoptedRecord({
  record,
  onViewPlan,
}: {
  record: PlanGenRecord;
  onViewPlan: () => void;
}) {
  const plan = record.result?.plan;

  return (
    <div className="flex items-center gap-3 p-3 rounded-md bg-muted/30 opacity-60">
      <CheckCircle className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground truncate">
          {plan?.name ?? record.intent}
        </p>
      </div>
      <Badge variant="secondary" className="text-[10px] h-5 opacity-60">
        已采纳
      </Badge>
      <Button
        variant="link"
        size="sm"
        className="text-xs shrink-0"
        onClick={onViewPlan}
      >
        查看
      </Button>
    </div>
  );
}

function FailedRecord({
  record,
  onRetry,
}: {
  record: PlanGenRecord;
  onRetry: () => void;
}) {
  return (
    <div className="p-3 rounded-md bg-destructive/10 space-y-2">
      <div className="flex items-start gap-2">
        <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{record.intent}</p>
          {record.error && (
            <p className="text-xs text-destructive line-clamp-1">
              {record.error}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">
          {formatRelativeTime(record.startedAt)}
        </span>
        <Button variant="outline" size="sm" className="text-xs" onClick={onRetry}>
          重试
        </Button>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────

export function PlanGenRecordsSection({
  projectId,
  onOpenV2Dialog,
  onAdopt,
  onRetry,
}: PlanGenRecordsSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const { data: records = [], isLoading, isError } = usePlanGenRecords(projectId);
  const discardMutation = useDiscardPlanGen(projectId);

  // Group records by status
  const { generating, pending, adopted, failed } = useMemo(() => {
    const generating: PlanGenRecord[] = [];
    const pending: PlanGenRecord[] = [];
    const adopted: PlanGenRecord[] = [];
    const failed: PlanGenRecord[] = [];

    for (const record of records) {
      switch (record.status) {
        case "generating":
          generating.push(record);
          break;
        case "completed_pending":
          pending.push(record);
          break;
        case "completed_adopted":
          adopted.push(record);
          break;
        case "failed":
          failed.push(record);
          break;
      }
    }

    return { generating, pending, adopted, failed };
  }, [records]);

  const totalCount = records.length;
  const hasRecords = totalCount > 0;

  // Handle discard with confirmation toast
  const handleDiscard = useCallback(
    (record: PlanGenRecord) => {
      toast("确定丢弃这条生成记录？", {
        action: {
          label: "丢弃",
          onClick: () => {
            discardMutation.mutate(record.id);
          },
        },
        duration: 5000,
      });
    },
    [discardMutation]
  );

  // Handle retry
  const handleRetry = useCallback(
    (record: PlanGenRecord) => {
      onRetry(record);
    },
    [onRetry]
  );

  // Handle view adopted plan
  const handleViewPlan = useCallback((record: PlanGenRecord) => {
    if (record.adoptedPlanId) {
      // Navigate to plan detail
      const url = new URL(window.location.href);
      url.searchParams.set("view", record.adoptedPlanId!);
      window.history.pushState({}, "", url.toString());
      // Trigger a popstate event to notify the page
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, []);

  // Empty state
  if (!hasRecords && !isLoading) {
    return null;
  }

  // Loading state
  if (isLoading) {
    return (
      <Card className="p-4 bg-muted/30">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-16 w-full" />
      </Card>
    );
  }

  // Error state
  if (isError) {
    return (
      <Card className="p-4 bg-destructive/10">
        <p className="text-sm text-destructive">加载生成记录失败</p>
      </Card>
    );
  }

  // Render records (sorted: generating > pending > failed > adopted)
  const displayRecords = expanded
    ? [...generating, ...pending, ...failed, ...adopted]
    : [...generating, ...pending, ...failed].slice(0, 3);

  return (
    <Card className="p-4 bg-muted/30">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-medium">AI 生成记录</span>
          <Badge variant="secondary" className="text-xs">
            {totalCount}
          </Badge>
        </div>
        {hasRecords && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-6"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                收起 <ChevronUp className="h-3 w-3 ml-1" />
              </>
            ) : (
              <>
                查看全部 <ChevronDown className="h-3 w-3 ml-1" />
              </>
            )}
          </Button>
        )}
      </div>

      {/* Record list */}
      <div className="space-y-2">
        {displayRecords.map((record) => {
          switch (record.status) {
            case "generating":
              return (
                <GeneratingRecord
                  key={record.id}
                  record={record}
                  onViewProgress={onOpenV2Dialog}
                />
              );
            case "completed_pending":
              return (
                <PendingAdoptRecord
                  key={record.id}
                  record={record}
                  onAdopt={() => onAdopt(record)}
                  onDiscard={() => handleDiscard(record)}
                />
              );
            case "completed_adopted":
              return (
                <AdoptedRecord
                  key={record.id}
                  record={record}
                  onViewPlan={() => handleViewPlan(record)}
                />
              );
            case "failed":
              return (
                <FailedRecord
                  key={record.id}
                  record={record}
                  onRetry={() => handleRetry(record)}
                />
              );
            default:
              return null;
          }
        })}
      </div>
    </Card>
  );
}
