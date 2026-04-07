import { cn } from "@/lib/utils";

interface HorizontalBarItem {
  label: string;
  value: number;
  color?: string;
}

interface HorizontalBarProps {
  items: HorizontalBarItem[];
  maxValue?: number;
  className?: string;
}

export function HorizontalBar({ items, maxValue, className }: HorizontalBarProps) {
  const max = maxValue ?? Math.max(...items.map((i) => i.value), 1);

  return (
    <div className={cn("space-y-2", className)}>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="text-xs font-mono w-[160px] truncate text-right" title={item.label}>
            {item.label}
          </span>
          <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
            <div
              className="h-full rounded-sm transition-all"
              style={{
                width: `${(item.value / max) * 100}%`,
                backgroundColor: item.color ?? "hsl(var(--primary))",
              }}
            />
          </div>
          <span className="text-xs font-medium w-8 text-right">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
