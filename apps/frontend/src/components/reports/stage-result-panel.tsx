import { GateBadge } from "@/components/execution-progress/gate-badge";
import { MethodBadge } from "@/components/ui/method-badge";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import type { ReportStage } from "@/types/coverage";
import { useState } from "react";

interface StageResultPanelProps {
  stage: ReportStage;
  defaultOpen?: boolean;
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function StageResultPanel({ stage, defaultOpen }: StageResultPanelProps) {
  const [open, setOpen] = useState(
    defaultOpen ?? (stage.status === "failed"),
  );

  const failed = stage.results.filter((r) => !r.passed && !r.skipped);
  const skipped = stage.results.filter((r) => r.skipped);
  const passed = stage.results.filter((r) => r.passed);

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        className={cn(
          "flex items-center gap-3 px-4 py-3 w-full text-left transition-colors",
          stage.status === "passed" &&
            "bg-green-50/50 dark:bg-green-950/20 border-b border-green-200 dark:border-green-900",
          stage.status === "failed" &&
            "bg-red-50/50 dark:bg-red-950/20 border-b border-red-200 dark:border-red-900",
          stage.status === "skipped" &&
            "bg-muted/30 border-b border-muted",
        )}
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm">
          {stage.status === "passed" ? "✅" : stage.status === "failed" ? "⚠️" : "⏭"}
        </span>
        <span className="text-sm font-medium">{stage.name}</span>
        <span className="text-xs text-muted-foreground">
          {stage.passed}/{stage.total} ({Math.round(stage.passRate * 100)}%)
        </span>
        {stage.gateResult && (
          <GateBadge result={stage.gateResult} />
        )}
        <span className="text-xs text-muted-foreground ml-auto mr-2">
          {formatDuration(stage.duration)}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform text-muted-foreground",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Results */}
      {open && (
        <div className="divide-y">
          {/* Failed first */}
          {failed.map((r) => (
            <div
              key={r.caseId}
              className="flex items-center gap-2 px-4 py-2 text-xs hover:bg-accent/30"
            >
              <span>❌</span>
              <MethodBadge method={r.endpointMethod} />
              <span className="font-mono truncate flex-1">
                {r.endpointPath}
              </span>
              <span className="text-muted-foreground truncate max-w-[200px]">
                {r.caseName}
              </span>
              {r.failType && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                  {r.failType}
                </span>
              )}
              {r.isSecurity && (
                <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  ⚠️安全
                </span>
              )}
              <span className="text-muted-foreground w-14 text-right">
                {formatDuration(r.duration)}
              </span>
            </div>
          ))}

          {/* Skipped */}
          {skipped.map((r) => (
            <div
              key={r.caseId}
              className="flex items-center gap-2 px-4 py-2 text-xs hover:bg-accent/30 text-muted-foreground"
            >
              <span>⏭</span>
              <MethodBadge method={r.endpointMethod} />
              <span className="font-mono truncate flex-1">{r.endpointPath}</span>
              <span className="truncate max-w-[200px]">{r.caseName}</span>
              <span className="text-[10px]">skipped</span>
            </div>
          ))}

          {/* Passed — collapsed */}
          {passed.length > 0 && (
            <div className="px-4 py-2 text-xs text-muted-foreground">
              ✅ (已折叠 {passed.length} 条通过用例)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
