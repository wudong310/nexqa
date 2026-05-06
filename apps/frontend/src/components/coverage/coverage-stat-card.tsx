import { Card } from "@/components/ui/card";
import { RingProgress } from "@/components/ui/ring-progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface CoverageStatCardProps {
  title: string;
  icon: LucideIcon;
  percentage: number;
  covered: number;
  total: number;
  uncovered: number;
  uncoveredLabel: string;
  trend?: number;
  loading?: boolean;
}

export function CoverageStatCard({
  title,
  icon: Icon,
  percentage,
  covered,
  total,
  uncovered,
  uncoveredLabel,
  trend,
  loading,
}: CoverageStatCardProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex justify-center mb-3">
          <Skeleton className="h-20 w-20 rounded-full" />
        </div>
        <Skeleton className="h-3 w-16 mx-auto mb-2" />
        <Skeleton className="h-3 w-28 mx-auto" />
      </Card>
    );
  }

  const isNoData = total === 0;

  return (
    <Card
      className="p-6"
      aria-label={
        isNoData
          ? `${title} 暂无数据`
          : `${title} ${Math.round(percentage)}%，${covered}/${total}`
      }
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
        </div>
        {trend !== undefined && trend !== 0 && (
          <span
            className={cn(
              "text-[10px] font-medium",
              trend > 0 ? "text-green-600" : "text-red-600",
            )}
          >
            {trend > 0 ? "↑" : "↓"}
            {trend > 0 ? "+" : ""}
            {trend}%
          </span>
        )}
      </div>

      <div className="flex justify-center mb-3">
        <RingProgress value={isNoData ? 0 : percentage} size={80} strokeWidth={8}>
          <span className="text-2xl font-bold">
            {isNoData ? "—" : `${Math.round(percentage)}%`}
          </span>
        </RingProgress>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        {isNoData ? "暂无数据" : `${covered}/${total} ${title.replace("覆盖率", "")}`}
      </p>

      {!isNoData && uncovered > 0 && (
        <p
          className={cn(
            "text-xs text-center mt-1",
            uncovered === 0
              ? "text-green-600"
              : uncovered <= 3
                ? "text-amber-600"
                : "text-red-600",
          )}
        >
          {uncoveredLabel}
        </p>
      )}
    </Card>
  );
}
