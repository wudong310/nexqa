import { ConfidenceBadge } from "@/components/ai/confidence-badge";
import { MethodBadge } from "@/components/ui/method-badge";
import { cn } from "@/lib/utils";
import type { GeneratedStep } from "@/types/chain-gen";
import { AlertTriangle } from "lucide-react";

interface GeneratedStepRowProps {
  step: GeneratedStep;
  index: number;
}

export function GeneratedStepRow({ step, index }: GeneratedStepRowProps) {
  const isLowConfidence = step.confidence < 0.8;

  return (
    <div
      className={cn(
        "rounded-md border p-2.5 space-y-1",
        isLowConfidence
          ? "border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20"
          : "border-border bg-muted/20",
      )}
    >
      {/* Step title row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-mono text-muted-foreground w-12 shrink-0">
            Step {index}
          </span>
          <MethodBadge method={step.method} />
          <span className="text-xs font-mono truncate">{step.path}</span>
          <span className="text-xs text-muted-foreground shrink-0">
            — {step.label}
          </span>
        </div>
        <ConfidenceBadge value={step.confidence} />
      </div>

      {/* Extractors */}
      {step.extractors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-14">
          {step.extractors.map((ext, j) => (
            <span
              key={`ext-${j}`}
              className="text-[10px] font-mono text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-1.5 py-0.5 rounded"
            >
              提取: {ext.variable} ← {ext.expression}
            </span>
          ))}
        </div>
      )}

      {/* Injectors */}
      {step.injectors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-14">
          {step.injectors.map((inj, j) => (
            <span
              key={`inj-${j}`}
              className="text-[10px] font-mono text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-1.5 py-0.5 rounded"
            >
              注入: {inj.variable} → {inj.target} {inj.expression}
            </span>
          ))}
        </div>
      )}

      {/* Low confidence warning */}
      {isLowConfidence && step.reasoning && (
        <div className="flex items-start gap-1.5 pl-14 pt-1">
          <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
          <span className="text-[10px] text-amber-600 dark:text-amber-400">
            {step.reasoning}
          </span>
        </div>
      )}
    </div>
  );
}
