import { cn } from "@/lib/utils";
import { getVarColor, type buildVarColorMap } from "./var-tag";
import { AlertTriangle, CheckCircle, Clock, XCircle } from "lucide-react";
import type { Extractor, Injector, TestChainStep } from "@nexqa/shared";

// ── Types ───────────────────────────────────────────

interface VarInfo {
  name: string;
  colorIndex: number;
  sourceStep: number;
  sourceLabel: string;
  expression: string;
  usedBySteps: { index: number; label: string; target: string }[];
  /** Runtime value during execution */
  runtimeValue?: unknown;
  /** Runtime status */
  runtimeStatus?: "waiting" | "extracted" | "failed";
}

interface VarPoolProps {
  steps: { label: string; extractors: Extractor[]; injectors: Injector[] }[];
  varColorMap: ReturnType<typeof buildVarColorMap>;
  highlightedVar: string | null;
  onHoverVar: (varName: string | null) => void;
  /** Runtime extracted values (during execution) */
  runtimeValues?: Record<string, unknown>;
  /** Step execution progress (index of currently executing step, -1 if not running) */
  currentStepIndex?: number;
  className?: string;
}

// ── Component ───────────────────────────────────────

export function VarPool({
  steps,
  varColorMap,
  highlightedVar,
  onHoverVar,
  runtimeValues,
  currentStepIndex = -1,
  className,
}: VarPoolProps) {
  // Build variable info
  const vars: VarInfo[] = [];
  const seenVars = new Set<string>();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    for (const ext of step.extractors) {
      if (ext.varName && !seenVars.has(ext.varName)) {
        seenVars.add(ext.varName);

        const usedBy: VarInfo["usedBySteps"] = [];
        for (let j = i + 1; j < steps.length; j++) {
          for (const inj of steps[j].injectors) {
            if (inj.varName === ext.varName) {
              usedBy.push({
                index: j,
                label: steps[j].label || `步骤 ${j + 1}`,
                target: inj.target,
              });
            }
          }
        }

        // Determine runtime status
        let runtimeStatus: VarInfo["runtimeStatus"];
        let runtimeValue: unknown;
        if (runtimeValues) {
          if (ext.varName in runtimeValues) {
            runtimeValue = runtimeValues[ext.varName];
            runtimeStatus = runtimeValue !== undefined ? "extracted" : "failed";
          } else if (currentStepIndex >= 0 && i <= currentStepIndex) {
            runtimeStatus = "failed";
          } else {
            runtimeStatus = "waiting";
          }
        }

        vars.push({
          name: ext.varName,
          colorIndex: varColorMap.get(ext.varName) ?? 0,
          sourceStep: i,
          sourceLabel: step.label || `步骤 ${i + 1}`,
          expression: ext.expression,
          usedBySteps: usedBy,
          runtimeValue,
          runtimeStatus,
        });
      }
    }
  }

  // Check for broken injections (varName referenced but never extracted)
  const brokenVars: { varName: string; stepIndex: number; stepLabel: string }[] = [];
  for (let i = 0; i < steps.length; i++) {
    for (const inj of steps[i].injectors) {
      if (inj.varName && !seenVars.has(inj.varName)) {
        brokenVars.push({
          varName: inj.varName,
          stepIndex: i,
          stepLabel: steps[i].label || `步骤 ${i + 1}`,
        });
      }
    }
  }

  return (
    <div className={cn("space-y-4", className)}>
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        变量池
      </h3>

      {vars.length === 0 && brokenVars.length === 0 && (
        <p className="text-xs text-muted-foreground">
          添加步骤后，提取的变量将显示在这里
        </p>
      )}

      {/* Chain variables */}
      {vars.length > 0 && (
        <div className="space-y-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            链变量
          </span>
          {vars.map((v) => {
            const color = getVarColor(v.colorIndex);
            const isHighlighted = highlightedVar === v.name;
            const unused = v.usedBySteps.length === 0;

            return (
              <div
                key={v.name}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs space-y-0.5 transition-all duration-150 border",
                  color.light,
                  color.dark,
                  isHighlighted && `ring-2 ring-offset-1 ${color.ring}`,
                  highlightedVar && !isHighlighted && "opacity-40",
                )}
                onMouseEnter={() => onHoverVar(v.name)}
                onMouseLeave={() => onHoverVar(null)}
              >
                <div className="flex items-center gap-1.5">
                  <div className={cn("h-2 w-2 rounded-full shrink-0", color.dot)} />
                  <span className="font-mono font-medium">{v.name}</span>
                  {/* Runtime value */}
                  {v.runtimeStatus === "extracted" && (
                    <CheckCircle className="h-3 w-3 text-green-600 shrink-0 ml-auto" />
                  )}
                  {v.runtimeStatus === "waiting" && (
                    <Clock className="h-3 w-3 text-muted-foreground shrink-0 ml-auto" />
                  )}
                  {v.runtimeStatus === "failed" && (
                    <XCircle className="h-3 w-3 text-red-600 shrink-0 ml-auto" />
                  )}
                </div>
                <div className="text-[10px] opacity-70 pl-3.5">
                  来源: Step {v.sourceStep + 1} · {v.expression}
                </div>
                {v.runtimeValue !== undefined && (
                  <div className="text-[10px] font-mono pl-3.5 truncate">
                    = {JSON.stringify(v.runtimeValue)}
                  </div>
                )}
                {!runtimeValues && unused && (
                  <div className="text-[10px] pl-3.5 flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="h-3 w-3" />
                    未使用
                  </div>
                )}
                {!runtimeValues && !unused && (
                  <div className="text-[10px] opacity-70 pl-3.5">
                    使用: {v.usedBySteps.map((s) => `Step ${s.index + 1}`).join(", ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Broken variables */}
      {brokenVars.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-medium text-red-600 uppercase tracking-wider">
            ❌ 断裂变量
          </span>
          {brokenVars.map((bv, i) => (
            <div
              key={`broken-${i}`}
              className="rounded-md px-2.5 py-1.5 text-xs border border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
            >
              <span className="font-mono font-medium">{bv.varName}</span>
              <span className="text-[10px] opacity-70 ml-1">
                — Step {bv.stepIndex + 1} 引用但未定义
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
