import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ApiDiff } from "@/types/regression";
import { AlertTriangle, Minus, Pencil, Plus } from "lucide-react";

export function DiffSummaryCards({ diff }: { diff: ApiDiff }) {
  const cards = [
    { label: "新增", count: diff.added.length, color: "green", Icon: Plus },
    { label: "删除", count: diff.removed.length, color: "red", Icon: Minus },
    { label: "修改", count: diff.modified.length, color: "amber", Icon: Pencil },
    {
      label: "Breaking",
      count: diff.modified.filter((m) => m.severity === "breaking").length,
      color: "orange",
      Icon: AlertTriangle,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {cards.map((c) => (
        <Card
          key={c.label}
          className={cn(
            "text-center py-3",
            c.count > 0 && "border-opacity-100",
          )}
        >
          <div
            className={cn(
              "text-2xl font-bold",
              c.color === "green" && "text-green-600 dark:text-green-400",
              c.color === "red" && "text-red-600 dark:text-red-400",
              c.color === "amber" && "text-amber-600 dark:text-amber-400",
              c.color === "orange" && "text-orange-600 dark:text-orange-400",
            )}
          >
            {c.count}
          </div>
          <div className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
            <c.Icon className="h-3 w-3" />
            {c.label}
          </div>
        </Card>
      ))}
    </div>
  );
}
