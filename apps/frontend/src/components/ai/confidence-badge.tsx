import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-mono shrink-0",
        pct >= 90
          ? "border-green-300 text-green-700 dark:border-green-700 dark:text-green-300"
          : pct >= 70
            ? "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300"
            : "border-red-300 text-red-700 dark:border-red-700 dark:text-red-300",
      )}
    >
      {pct}%
    </Badge>
  );
}
