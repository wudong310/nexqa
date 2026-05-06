import { cn } from "@/lib/utils";
import { AlertTriangle, Trash2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ApiChangeFlag } from "@nexqa/shared";

interface ApiChangeBadgeProps {
  flag: ApiChangeFlag;
  className?: string;
}

export function ApiChangeBadge({ flag, className }: ApiChangeBadgeProps) {
  const isDeleted = flag.changeType === "deleted";

  const label = isDeleted ? "API 已删除" : "API 已变更";
  const Icon = isDeleted ? Trash2 : AlertTriangle;

  const colorClasses = isDeleted
    ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
    : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";

  const tooltipLines: string[] = [];
  if (flag.changedAt) {
    tooltipLines.push(`变更于 ${new Date(flag.changedAt).toLocaleDateString("zh-CN")}`);
  }
  if (flag.changes && flag.changes.length > 0) {
    for (const c of flag.changes.slice(0, 3)) {
      tooltipLines.push(`• ${c.detail}`);
    }
    if (flag.changes.length > 3) {
      tooltipLines.push(`... 共 ${flag.changes.length} 项变更`);
    }
  }
  if (isDeleted) {
    tooltipLines.push(`来源文档: ${flag.documentName}`);
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium cursor-default",
            colorClasses,
            className,
          )}
        >
          <Icon className="h-3 w-3" />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-0.5 text-xs">
          {tooltipLines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
          {tooltipLines.length > 0 && <p className="text-muted-foreground">点击查看详情</p>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
