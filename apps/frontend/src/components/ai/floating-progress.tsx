import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  CheckCircle,
  ChevronRight,
  Loader2,
  X,
  XCircle,
} from "lucide-react";

interface FloatingProgressProps {
  icon: React.ElementType;
  label: string;
  current: number;
  total: number;
  elapsed: string;
  status: "running" | "success" | "error";
  onViewDetail: () => void;
  onDismiss: () => void;
}

export function FloatingProgress({
  label,
  current,
  total,
  elapsed,
  status,
  onViewDetail,
  onDismiss,
}: FloatingProgressProps) {
  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 -translate-x-1/2 z-50",
        "flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-lg border",
        "bg-background/95 backdrop-blur-sm",
        "max-w-[480px] w-[calc(100%-2rem)]",
        "animate-in slide-in-from-bottom-4 duration-300",
      )}
      role="status"
      aria-live="polite"
    >
      {/* Icon */}
      {status === "running" ? (
        <Loader2 className="h-4 w-4 animate-spin text-orange-500 shrink-0" />
      ) : status === "success" ? (
        <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
      )}

      {/* Label */}
      <span className="text-sm font-medium whitespace-nowrap">{label}</span>

      {/* Progress bar */}
      <Progress
        value={total > 0 ? (current / total) * 100 : 0}
        className="flex-1 h-1.5"
      />

      {/* Progress text */}
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {current}/{total}
      </span>

      {/* Elapsed */}
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        ⏱ {elapsed}
      </span>

      {/* View detail */}
      <Button
        variant="ghost"
        size="sm"
        className="text-xs h-6 shrink-0"
        onClick={onViewDetail}
      >
        查看详情
        <ChevronRight className="h-3 w-3 ml-0.5" />
      </Button>

      {/* Dismiss (only when not running) */}
      {status !== "running" && (
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          onClick={onDismiss}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
