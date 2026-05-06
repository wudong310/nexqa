import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ImpactAnalysis } from "@/types/regression";
import { ChevronDown, Circle, Link2 } from "lucide-react";
import { useState } from "react";

function MiniStatCard({
  label,
  value,
  suffix,
  color,
}: {
  label: string;
  value: number;
  suffix: string;
  color: "red" | "amber" | "green";
}) {
  return (
    <Card className="py-2 text-center">
      <div
        className={cn(
          "text-lg font-bold",
          color === "red" && "text-red-600 dark:text-red-400",
          color === "amber" && "text-amber-600 dark:text-amber-400",
          color === "green" && "text-green-600 dark:text-green-400",
        )}
      >
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground">
        {label} ({suffix})
      </div>
    </Card>
  );
}

function ImpactCaseRow({
  caseName,
  method,
  path,
  priority,
  phase,
  impact,
  aiSuggestion,
}: {
  caseName: string;
  method: string;
  path: string;
  priority: string;
  phase: string;
  impact: string;
  aiSuggestion: string;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono font-medium">
          {method} {path} - {caseName}
        </span>
        <Badge variant="outline" className="text-[10px]">
          {priority}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {phase}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">⚠️ {impact}</p>
      <p className="text-xs text-teal-600 dark:text-teal-400">
        💡 AI 建议: {aiSuggestion}
      </p>
    </div>
  );
}

function ImpactChainRow({
  chainName,
  affectedStep,
  cascadeRisk,
}: {
  chainName: string;
  affectedStep: string;
  cascadeRisk: string;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-1">
      <div className="flex items-center gap-2">
        <Link2 className="h-3.5 w-3.5 text-teal-500" />
        <span className="text-xs font-medium">{chainName}</span>
      </div>
      <p className="text-xs text-muted-foreground">{affectedStep}</p>
      <p className="text-xs text-amber-600 dark:text-amber-400">
        ⚠️ {cascadeRisk}
      </p>
    </div>
  );
}

export function ImpactPanel({ impact }: { impact: ImpactAnalysis }) {
  const [showAll, setShowAll] = useState(false);
  const displayLimit = 5;

  return (
    <div className="space-y-4 mt-3 pl-4 border-l-2 border-teal-300 dark:border-teal-700">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <MiniStatCard
          label="直接影响"
          value={impact.directCases.length}
          suffix="个用例"
          color="red"
        />
        <MiniStatCard
          label="间接影响"
          value={impact.indirectChains.length}
          suffix="条测试链"
          color="amber"
        />
        <MiniStatCard
          label="需新增"
          value={impact.newCasesNeeded.reduce((s, n) => s + n.estimatedCount, 0)}
          suffix="个用例"
          color="green"
        />
      </div>

      {/* Direct cases */}
      {impact.directCases.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Circle className="h-3 w-3 fill-red-500 text-red-500" />
            直接受影响的用例 ({impact.directCases.length})
          </div>
          <div className="space-y-2">
            {(showAll
              ? impact.directCases
              : impact.directCases.slice(0, displayLimit)
            ).map((c) => (
              <ImpactCaseRow key={c.caseId} {...c} />
            ))}
            {!showAll && impact.directCases.length > displayLimit && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => setShowAll(true)}
              >
                <ChevronDown className="h-3 w-3 mr-1" />
                展开全部 ({impact.directCases.length - displayLimit} 更多)
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Indirect chains */}
      {impact.indirectChains.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Circle className="h-3 w-3 fill-amber-500 text-amber-500" />
            间接受影响的测试链 ({impact.indirectChains.length})
          </div>
          <div className="space-y-2">
            {impact.indirectChains.map((ch) => (
              <ImpactChainRow key={ch.chainId} {...ch} />
            ))}
          </div>
        </div>
      )}

      {/* New cases needed */}
      {impact.newCasesNeeded.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Circle className="h-3 w-3 fill-green-500 text-green-500" />
            需要新增的用例
          </div>
          <div className="space-y-1">
            {impact.newCasesNeeded.map((n, i) => (
              <div key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                <span className="font-mono">{n.method} {n.path}</span>
                <span>— {n.description} (~{n.estimatedCount} 个)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
