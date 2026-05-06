import { cn } from "@/lib/utils";
import { CheckCircle, Clock, Loader2 } from "lucide-react";

// ── Step type ───────────────────────────────────────

export interface AIProgressStep {
  /** Unique step identifier */
  id: string;
  /** Display label (e.g. "读取 API 文档") */
  label: string;
  /** Optional detail shown to the right (e.g. "12 个接口") */
  detail?: string;
  /** Step status */
  status: "done" | "running" | "waiting";
}

// ── Props ───────────────────────────────────────────

export interface AIProgressStepsProps {
  /** List of steps to display */
  steps: AIProgressStep[];
  /** Optional hint text shown below the step list */
  hint?: string;
  /** Running step accent color class (default: "text-violet-500") */
  accentColor?: string;
}

// ── Internal: Step icon ─────────────────────────────

function StepIcon({
  status,
  accentColor,
}: {
  status: AIProgressStep["status"];
  accentColor: string;
}) {
  if (status === "done") {
    return <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />;
  }
  if (status === "running") {
    return (
      <Loader2 className={cn("h-4 w-4 animate-spin shrink-0", accentColor)} />
    );
  }
  return <Clock className="h-4 w-4 text-muted-foreground/50 shrink-0" />;
}

/**
 * Shared step-list progress indicator for AI sheets.
 *
 * Renders a vertical list of steps with done/running/waiting icons.
 * Used by analysis-sheet (AnalysisProgress) and chain-gen-sheet (ChainGenProgress).
 *
 * Usage:
 * ```tsx
 * <AIProgressSteps
 *   steps={[
 *     { id: "1", label: "解析 API", status: "done" },
 *     { id: "2", label: "生成用例", status: "running", detail: "3/10" },
 *     { id: "3", label: "写入结果", status: "waiting" },
 *   ]}
 *   hint="AI 正在分析请求-响应对..."
 *   accentColor="text-violet-500"
 * />
 * ```
 */
export function AIProgressSteps({
  steps,
  hint,
  accentColor = "text-violet-500",
}: AIProgressStepsProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        {steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              "flex items-center gap-3 text-sm",
              step.status === "waiting" && "opacity-50",
            )}
          >
            <StepIcon status={step.status} accentColor={accentColor} />
            <span
              className={cn(
                step.status === "running" && "font-medium text-foreground",
                step.status === "done" && "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
            {step.detail && (
              <span className="text-xs text-muted-foreground ml-auto">
                {step.detail}
              </span>
            )}
          </div>
        ))}
      </div>

      {hint && (
        <p className="text-xs text-muted-foreground">
          💡 {hint}
        </p>
      )}
    </div>
  );
}
