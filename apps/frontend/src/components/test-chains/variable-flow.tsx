import type { TestChainStep } from "@nexqa/shared";
import { useMemo } from "react";
import { buildVarColorMap, VarTag } from "./var-tag";

interface VariableFlowProps {
  steps: TestChainStep[];
  highlightedVar: string | null;
  onHoverVar: (varName: string | null) => void;
}

interface VariableInfo {
  name: string;
  colorIndex: number;
  extractedByStepIndex: number;
  extractedByLabel: string;
  expression: string;
  usedBySteps: { index: number; label: string; target: string }[];
}

/**
 * Builds a map of which step extracts each variable
 * and which steps inject (use) it.
 */
function buildVariableFlow(
  steps: TestChainStep[],
  colorMap: Map<string, number>,
): VariableInfo[] {
  const varMap = new Map<string, VariableInfo>();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    for (const ext of step.extractors) {
      if (!varMap.has(ext.varName)) {
        varMap.set(ext.varName, {
          name: ext.varName,
          colorIndex: colorMap.get(ext.varName) ?? 0,
          extractedByStepIndex: i,
          extractedByLabel: step.label || `步骤 ${i + 1}`,
          expression: ext.expression,
          usedBySteps: [],
        });
      }
    }
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    for (const inj of step.injectors) {
      const info = varMap.get(inj.varName);
      if (info) {
        info.usedBySteps.push({
          index: i,
          label: step.label || `步骤 ${i + 1}`,
          target: inj.target,
        });
      }
    }
  }

  return [...varMap.values()];
}

export function VariableFlow({
  steps,
  highlightedVar,
  onHoverVar,
}: VariableFlowProps) {
  // Collect all var names in order of appearance
  const allVarNames = useMemo(() => {
    const names: string[] = [];
    for (const step of steps) {
      for (const ext of step.extractors) {
        if (!names.includes(ext.varName)) names.push(ext.varName);
      }
    }
    return names;
  }, [steps]);

  const colorMap = useMemo(() => buildVarColorMap(allVarNames), [allVarNames]);
  const flow = useMemo(
    () => buildVariableFlow(steps, colorMap),
    [steps, colorMap],
  );

  if (flow.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-3">
        暂无变量流 — 在步骤中添加提取器和注入器
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        变量流
      </h4>
      <div className="space-y-1.5">
        {flow.map((v) => {
          const isHighlighted = highlightedVar === v.name;
          const isDimmed = highlightedVar !== null && !isHighlighted;

          return (
            <div
              key={v.name}
              className="flex items-center gap-2 flex-wrap text-xs"
            >
              <VarTag
                varName={v.name}
                type="extract"
                colorIndex={v.colorIndex}
                expression={v.expression}
                isHighlighted={isHighlighted}
                isDimmed={isDimmed}
                onHoverStart={onHoverVar}
                onHoverEnd={() => onHoverVar(null)}
              />

              {v.usedBySteps.length > 0 &&
                v.usedBySteps.map((target) => (
                  <VarTag
                    key={`${v.name}-${target.index}`}
                    varName={v.name}
                    type="inject"
                    colorIndex={v.colorIndex}
                    expression={`${target.target} (Step ${target.index + 1})`}
                    isHighlighted={isHighlighted}
                    isDimmed={isDimmed}
                    onHoverStart={onHoverVar}
                    onHoverEnd={() => onHoverVar(null)}
                  />
                ))}

              {v.usedBySteps.length === 0 && (
                <span className="text-amber-600 text-[10px] flex items-center gap-0.5">
                  ⚠️ 未使用
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
