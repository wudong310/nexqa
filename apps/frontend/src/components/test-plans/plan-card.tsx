import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { priorityColor } from "@/components/tag-filter-bar";
import type { TestPlan } from "@nexqa/shared";
import { Loader2, Pencil, Play, Trash2 } from "lucide-react";

// ── Label maps ──────────────────────────────────────

const PURPOSE_LABELS: Record<string, string> = {
  functional: "功能",
  auth: "鉴权",
  "data-integrity": "数据完整性",
  security: "安全",
  idempotent: "幂等",
  performance: "性能",
};

const STRATEGY_LABELS: Record<string, string> = {
  positive: "正向",
  negative: "反向",
  boundary: "边界值",
  destructive: "破坏性",
};

const PHASE_LABELS: Record<string, string> = {
  smoke: "冒烟",
  regression: "回归",
  full: "完整",
  targeted: "定向",
};

// ── Helpers ─────────────────────────────────────────

function formatSelectionSummary(plan: TestPlan): string {
  const parts: string[] = [];
  const tags = plan.selection?.tags;
  if (tags?.phase?.length) {
    parts.push(`阶段=${tags.phase.map((p) => PHASE_LABELS[p] || p).join("+")}`);
  }
  if (tags?.priority?.length) {
    parts.push(`优先级=${tags.priority.join("+")}`);
  }
  if (tags?.purpose?.length) {
    parts.push(`目的=${tags.purpose.map((p) => PURPOSE_LABELS[p] || p).join("+")}`);
  }
  if (tags?.strategy?.length) {
    parts.push(`策略=${tags.strategy.map((s) => STRATEGY_LABELS[s] || s).join("+")}`);
  }
  if (parts.length === 0) return "全部用例";
  return parts.join(", ");
}

// ── Component ───────────────────────────────────────

interface PlanCardProps {
  plan: TestPlan;
  onEdit: () => void;
  onDelete: () => void;
  onExecute: () => void;
  onViewDetail: () => void;
  isExecuting: boolean;
}

export function PlanCard({
  plan,
  onEdit,
  onDelete,
  onExecute,
  onViewDetail,
  isExecuting,
}: PlanCardProps) {
  return (
    <Card
      className="group cursor-pointer hover:border-primary/40 transition-colors"
      onClick={onViewDetail}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1 min-w-0 flex-1">
            <h3 className="text-sm font-medium leading-none truncate">
              {plan.name}
            </h3>
            {plan.description && (
              <p className="text-xs text-muted-foreground line-clamp-1">
                {plan.description}
              </p>
            )}
          </div>
          {/* #9 P0: Mobile buttons always visible (opacity-100 on mobile, hover on desktop) */}
          <div
            className="flex items-center gap-1 transition-opacity shrink-0 ml-2 opacity-100 md:opacity-0 md:group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={onExecute}
                  disabled={isExecuting}
                >
                  {isExecuting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>执行方案</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={onEdit}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>编辑</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>删除</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {/* Selection summary */}
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">范围:</span>{" "}
            {formatSelectionSummary(plan)}
          </div>

          {/* Execution config summary */}
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="text-[10px] h-5">
              并发 {plan.execution?.concurrency ?? 3}
            </Badge>
            <Badge variant="outline" className="text-[10px] h-5">
              {plan.execution?.stopOnGateFail ? "门禁: 开" : "门禁: 关"}
            </Badge>
            <Badge variant="outline" className="text-[10px] h-5">
              通过率 ≥{Math.round((plan.criteria?.minPassRate ?? 0.95) * 100)}%
            </Badge>
            {plan.selection?.tags?.priority?.map((p) => (
              <Badge
                key={p}
                variant="outline"
                className={`text-[10px] h-5 ${priorityColor(p)}`}
              >
                {p}
              </Badge>
            ))}
          </div>

          {/* Time */}
          <div className="text-[10px] text-muted-foreground">
            更新于{" "}
            {new Date(plan.updatedAt).toLocaleDateString("zh-CN", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
