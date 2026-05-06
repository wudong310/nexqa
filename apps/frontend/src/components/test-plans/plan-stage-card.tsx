import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlanStage } from "@/types/plan-gen";
import {
  BarChart3,
  Flame,
  FlaskConical,
  Shield,
  X,
} from "lucide-react";

const stageIcons: Record<
  string,
  { icon: React.ElementType; color: string }
> = {
  smoke: { icon: Flame, color: "text-orange-500" },
  regression: { icon: FlaskConical, color: "text-blue-500" },
  functional: { icon: FlaskConical, color: "text-blue-500" },
  security: { icon: Shield, color: "text-red-500" },
  performance: { icon: BarChart3, color: "text-emerald-500" },
};

interface PlanStageCardProps {
  stage: PlanStage;
  index: number;
  onViewCases?: () => void;
  onRemoveStage?: () => void;
}

export function PlanStageCard({
  stage,
  index,
  onViewCases,
  onRemoveStage,
}: PlanStageCardProps) {
  const { icon: Icon, color } =
    stageIcons[stage.type] || stageIcons.regression;

  return (
    <div className="flex items-start gap-3 p-3 border-b last:border-b-0 group">
      {/* Stage number */}
      <div className="flex items-center justify-center h-6 w-6 rounded-full bg-muted text-xs font-bold shrink-0 mt-0.5">
        {index}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", color)} />
          <span className="text-sm font-semibold">{stage.name}</span>
          {stage.gate && (
            <Badge
              variant="outline"
              className="text-[10px] border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400"
            >
              门禁 🔒
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {stage.caseCount ?? 0} 个用例
          {(stage.chainCount ?? 0) > 0 && ` + ${stage.chainCount} 条链`}
          {stage.criteria.minPassRate > 0 &&
            ` · 门禁 ${stage.criteria.minPassRate >= 1 ? "100%" : `≥${Math.round(stage.criteria.minPassRate * 100)}%`}`}
        </p>
        {stage.description && (
          <p className="text-xs text-muted-foreground">{stage.description}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {onViewCases && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onViewCases}
          >
            查看用例
          </Button>
        )}
        {onRemoveStage && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={onRemoveStage}
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </Button>
        )}
      </div>
    </div>
  );
}
