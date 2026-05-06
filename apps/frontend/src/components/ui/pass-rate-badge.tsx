import { cn } from "@/lib/utils";

interface PassRateBadgeProps {
  value: number; // 0-1
  className?: string;
}

export function PassRateBadge({ value, className }: PassRateBadgeProps) {
  const pct = Math.round(value * 100);
  const icon = pct >= 95 ? "✅" : pct >= 80 ? "⚠️" : "❌";
  const color =
    pct >= 95
      ? "text-green-600 dark:text-green-400"
      : pct >= 80
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  return (
    <span className={cn("text-xs font-medium", color, className)}>
      {icon} {pct}%
    </span>
  );
}
