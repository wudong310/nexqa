import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ChainExecutionResult } from "@/hooks/use-test-chains";
import type { TestCase } from "@nexqa/shared";
import {
  CheckCircle,
  Clock,
  XCircle,
} from "lucide-react";

interface ChainExecutionResultViewProps {
  result: ChainExecutionResult;
  caseMap: Map<string, TestCase>;
}

export function ChainExecutionResultView({
  result,
  caseMap,
}: ChainExecutionResultViewProps) {
  const totalPassed = result.steps.filter((s) => s.passed).length;
  const totalFailed = result.steps.filter((s) => !s.passed).length;
  const totalDuration = result.steps.reduce((sum, s) => sum + s.duration, 0);

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1 text-green-600">
          <CheckCircle className="h-4 w-4" />
          通过 {totalPassed}
        </span>
        {totalFailed > 0 && (
          <span className="flex items-center gap-1 text-red-600">
            <XCircle className="h-4 w-4" />
            失败 {totalFailed}
          </span>
        )}
        <span className="flex items-center gap-1 text-muted-foreground">
          <Clock className="h-4 w-4" />
          {totalDuration}ms
        </span>
      </div>

      {/* Step results */}
      <div className="space-y-2">
        {result.steps.map((step, i) => {
          const tc = caseMap.get(step.caseId);
          return (
            <div
              key={step.stepId}
              className={cn(
                "border rounded-lg p-3 space-y-1",
                step.passed
                  ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
                  : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950",
              )}
            >
              <div className="flex items-center gap-2">
                {step.passed ? (
                  <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                )}
                <span className="text-sm font-medium">
                  #{i + 1} {tc?.name ?? step.caseId}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {step.duration}ms
                </span>
              </div>

              {/* Extracted vars */}
              {Object.keys(step.extractedVars).length > 0 && (
                <div className="flex flex-wrap gap-1 ml-6">
                  {Object.entries(step.extractedVars).map(([key, val]) => (
                    <Badge
                      key={key}
                      variant="outline"
                      className="text-[10px] h-5 font-mono"
                    >
                      {key} = {JSON.stringify(val)}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Error */}
              {step.failReason && (
                <p className="text-xs text-red-600 ml-6">{step.failReason}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
