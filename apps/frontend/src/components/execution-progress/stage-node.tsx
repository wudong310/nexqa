import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CheckCircle,
  Clock,
  Loader2,
  Shield,
  ShieldCheck,
  ShieldX,
  SkipForward,
  XCircle,
} from "lucide-react";

// ── Types ───────────────────────────────────────────

export interface StageNodeData {
  name: string;
  status: "waiting" | "running" | "passed" | "failed" | "skipped";
  progress: { done: number; total: number };
  passRate?: number;
  gateResult?: "passed" | "failed" | null;
}

interface StageNodeProps {
  stage: StageNodeData;
  isActive?: boolean;
  onClick?: () => void;
}

// ── Component ───────────────────────────────────────

const STATUS_STYLES: Record<
  StageNodeData["status"],
  { border: string; icon: React.ReactNode; textColor: string }
> = {
  waiting: {
    border: "border-2 border-dashed border-muted",
    icon: <Clock className="h-4 w-4 text-muted-foreground" />,
    textColor: "text-muted-foreground",
  },
  running: {
    border: "border-2 border-blue-500 shadow-sm shadow-blue-500/20",
    icon: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
    textColor: "text-blue-600",
  },
  passed: {
    border: "border-2 border-green-500 bg-green-50/50 dark:bg-green-950/30",
    icon: <CheckCircle className="h-4 w-4 text-green-500" />,
    textColor: "text-green-600",
  },
  failed: {
    border: "border-2 border-red-500 bg-red-50/50 dark:bg-red-950/30",
    icon: <XCircle className="h-4 w-4 text-red-500" />,
    textColor: "text-red-600",
  },
  skipped: {
    border: "border-2 border-amber-400 bg-amber-50/50 dark:bg-amber-950/30",
    icon: <SkipForward className="h-4 w-4 text-amber-500" />,
    textColor: "text-amber-600",
  },
};

function GateIcon({ result }: { result: "passed" | "failed" | null | undefined }) {
  if (result === "passed") {
    return <ShieldCheck className="h-3.5 w-3.5 text-green-500" />;
  }
  if (result === "failed") {
    return <ShieldX className="h-3.5 w-3.5 text-red-500" />;
  }
  return <Shield className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function StageNode({ stage, isActive, onClick }: StageNodeProps) {
  const cfg = STATUS_STYLES[stage.status];
  const pct =
    stage.progress.total > 0
      ? Math.round((stage.progress.done / stage.progress.total) * 100)
      : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-32 rounded-lg p-3 transition-all text-left",
        cfg.border,
        isActive && "ring-2 ring-primary/40",
        "hover:opacity-90",
      )}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {cfg.icon}
        <span className="text-xs font-medium truncate">{stage.name}</span>
      </div>
      <div className={cn("text-[10px]", cfg.textColor)}>
        {stage.progress.done}/{stage.progress.total}
      </div>
      {stage.status !== "waiting" && stage.passRate !== undefined && (
        <div className={cn("text-[10px]", cfg.textColor)}>{pct}%</div>
      )}
      {stage.gateResult && (
        <div className="flex items-center gap-1 mt-1">
          <GateIcon result={stage.gateResult} />
          <span className="text-[10px] text-muted-foreground">
            {stage.gateResult === "passed" ? "PASS" : "FAIL"}
          </span>
        </div>
      )}
    </button>
  );
}
