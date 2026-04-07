import { cn } from "@/lib/utils";
import type { AnalysisStep } from "@/types/ai";
import { CheckCircle, Clock, Loader2 } from "lucide-react";

export function AnalysisProgress({ steps }: { steps: AnalysisStep[] }) {
  return (
    <div className="space-y-3 py-4">
      {steps.map((step) => (
        <div key={step.id} className="flex items-center gap-3">
          {step.status === "done" && (
            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
          )}
          {step.status === "running" && (
            <Loader2 className="h-4 w-4 animate-spin text-violet-500 shrink-0" />
          )}
          {step.status === "waiting" && (
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span
            className={cn(
              "text-sm",
              step.status === "done" && "text-muted-foreground",
              step.status === "running" && "font-medium",
              step.status === "waiting" && "text-muted-foreground",
            )}
          >
            {step.label}
          </span>
          {step.detail && (
            <span className="text-xs text-muted-foreground">
              {step.detail}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
