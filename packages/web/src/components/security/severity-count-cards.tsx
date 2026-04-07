import { cn } from "@/lib/utils";
import type { SecuritySummary } from "@/types/security";

const levels = [
  { key: "critical" as const, label: "严重", color: "bg-purple-600 text-white" },
  { key: "high" as const, label: "高危", color: "bg-red-600 text-white" },
  { key: "medium" as const, label: "中危", color: "bg-amber-500 text-white" },
  { key: "low" as const, label: "低危", color: "bg-blue-500 text-white" },
  { key: "info" as const, label: "信息", color: "bg-gray-400 text-white" },
];

interface SeverityCountCardsProps {
  summary: SecuritySummary;
}

export function SeverityCountCards({ summary }: SeverityCountCardsProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {levels.map((lvl) => {
        const count = summary[lvl.key];
        return (
          <div
            key={lvl.key}
            className={cn(
              "flex flex-col items-center rounded-lg px-4 py-2 min-w-[72px]",
              count > 0 ? lvl.color : "bg-muted text-muted-foreground",
            )}
          >
            <span className="text-2xl font-bold">{count}</span>
            <span className="text-[10px] uppercase tracking-wide">
              {lvl.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
