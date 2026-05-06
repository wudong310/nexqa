import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatMiniCardProps {
  label: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  valueColor?: string;
}

export function StatMiniCard({
  label,
  value,
  delta,
  deltaLabel = "较上次",
  valueColor,
}: StatMiniCardProps) {
  return (
    <Card className="p-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
        {label}
      </p>
      <p className={cn("text-xl font-bold mt-1", valueColor)}>{value}</p>
      {delta !== undefined && delta !== 0 && (
        <p
          className={cn(
            "text-[10px] mt-0.5",
            delta > 0 ? "text-green-600" : "text-red-600",
          )}
        >
          {delta > 0 ? "↑" : "↓"}
          {delta > 0 ? "+" : ""}
          {delta} {deltaLabel}
        </p>
      )}
    </Card>
  );
}
