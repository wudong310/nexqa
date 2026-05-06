import { Button } from "@/components/ui/button";
import type { Granularity, TimeRange } from "@/types/coverage";
import { cn } from "@/lib/utils";

interface TrendControlBarProps {
  granularity: Granularity;
  range: TimeRange;
  onGranularityChange: (g: Granularity) => void;
  onRangeChange: (r: TimeRange) => void;
}

const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "day", label: "天" },
  { value: "week", label: "周" },
  { value: "month", label: "月" },
];

const RANGES: { value: TimeRange; label: string }[] = [
  { value: "7d", label: "7天" },
  { value: "14d", label: "14天" },
  { value: "30d", label: "30天" },
  { value: "90d", label: "90天" },
];

export function TrendControlBar({
  granularity,
  range,
  onGranularityChange,
  onRangeChange,
}: TrendControlBarProps) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      {/* Granularity */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground mr-1">粒度:</span>
        <div className="flex rounded-md border overflow-hidden">
          {GRANULARITIES.map((g) => (
            <button
              key={g.value}
              onClick={() => onGranularityChange(g.value)}
              className={cn(
                "text-xs h-7 px-3 transition-colors",
                granularity === g.value
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Range */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground mr-1">范围:</span>
        {RANGES.map((r) => (
          <Button
            key={r.value}
            variant={range === r.value ? "secondary" : "ghost"}
            size="sm"
            className="text-xs h-7"
            onClick={() => onRangeChange(r.value)}
          >
            {r.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
