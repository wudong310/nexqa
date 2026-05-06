import { cn } from "@/lib/utils";
import type { HealthStatus } from "@/types/cicd";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Circle, Loader2, RotateCw } from "lucide-react";

export function HealthIndicator({
  status,
  onCheck,
}: {
  status: HealthStatus;
  onCheck: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {/* Status dot */}
      {status.state === "idle" && (
        <Circle className="h-2.5 w-2.5 text-muted-foreground/30" />
      )}
      {status.state === "checking" && (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      )}
      {status.state === "healthy" && (
        <Circle className="h-2.5 w-2.5 fill-green-500 text-green-500" />
      )}
      {status.state === "unhealthy" && (
        <Circle className="h-2.5 w-2.5 fill-red-500 text-red-500" />
      )}
      {status.state === "slow" && (
        <Circle className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
      )}

      {/* Latency text */}
      {status.state === "checking" && (
        <span className="text-[10px] text-muted-foreground">检测中...</span>
      )}
      {(status.state === "healthy" || status.state === "slow") &&
        status.latencyMs !== undefined && (
          <span
            className={cn(
              "text-[10px] font-mono",
              status.state === "healthy"
                ? "text-green-600 dark:text-green-400"
                : "text-amber-600 dark:text-amber-400",
            )}
          >
            {status.latencyMs}ms
          </span>
        )}
      {status.state === "unhealthy" && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[10px] text-red-600 dark:text-red-400 cursor-help">
                不可达
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{status.error || "连接失败或超时"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Refresh button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onCheck();
        }}
        disabled={status.state === "checking"}
      >
        <RotateCw
          className={cn(
            "h-2.5 w-2.5 text-muted-foreground",
            status.state === "checking" && "animate-spin",
          )}
        />
      </Button>
    </div>
  );
}
