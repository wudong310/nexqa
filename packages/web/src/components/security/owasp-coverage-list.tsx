import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OwaspCoverage } from "@/types/security";
import { CheckCircle, Circle } from "lucide-react";

interface OwaspCoverageListProps {
  coverage: OwaspCoverage[];
}

export function OwaspCoverageList({ coverage }: OwaspCoverageListProps) {
  return (
    <div className="space-y-1.5">
      {coverage.map((item) => (
        <div
          key={item.category}
          className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50"
        >
          <div className="flex items-center gap-2 text-xs">
            {item.tested ? (
              <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
            ) : (
              <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <span
              className={cn(
                item.tested
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {item.category}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {item.tested && (
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px]",
                  item.findingsCount > 0
                    ? "border-red-300 text-red-600"
                    : "border-green-300 text-green-600",
                )}
              >
                {item.findingsCount > 0
                  ? `${item.findingsCount} 发现`
                  : "安全"}
              </Badge>
            )}
            {!item.tested && (
              <span className="text-[10px] text-muted-foreground">
                未覆盖
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
