import { MethodBadge } from "@/components/ui/method-badge";
import { CoverageCell } from "./coverage-cell";
import { GenerateCasePopover } from "./generate-case-popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CoverageCell as CoverageCellData, CoverageEndpoint } from "@/types/coverage";
import type { Purpose } from "@nexqa/shared";
import { Fragment, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

const PURPOSES: Purpose[] = [
  "functional",
  "auth",
  "security",
  "data-integrity",
  "idempotent",
  "performance",
];

const PURPOSE_LABELS: Record<Purpose, string> = {
  functional: "功能",
  auth: "鉴权",
  security: "安全",
  "data-integrity": "数据完整性",
  idempotent: "幂等",
  performance: "性能",
};

interface CoverageMatrixProps {
  cells: CoverageCellData[];
  endpoints: CoverageEndpoint[];
}

export function CoverageMatrix({ cells, endpoints }: CoverageMatrixProps) {
  const [groupBy, setGroupBy] = useState<"module" | "flat">("module");
  const [sortBy, setSortBy] = useState<string>("uncovered-first");
  const [popoverState, setPopoverState] = useState<{
    endpointId: string;
    purpose: Purpose;
  } | null>(null);

  function findCell(endpointId: string, purpose: Purpose) {
    return (
      cells.find(
        (c) => c.endpointId === endpointId && c.purpose === purpose,
      ) ?? null
    );
  }

  // Group endpoints by module
  const groups =
    groupBy === "module"
      ? Object.entries(
          endpoints.reduce(
            (acc, ep) => {
              const mod = ep.module || "其他";
              if (!acc[mod]) acc[mod] = [];
              acc[mod].push(ep);
              return acc;
            },
            {} as Record<string, CoverageEndpoint[]>,
          ),
        )
      : [["全部", endpoints] as [string, CoverageEndpoint[]]];

  // Sort endpoints within groups
  function sortEndpoints(eps: CoverageEndpoint[]): CoverageEndpoint[] {
    if (sortBy === "uncovered-first") {
      return [...eps].sort((a, b) => {
        const aUncovered = PURPOSES.filter((p) => {
          const cell = findCell(a.id, p);
          return cell?.applicable && cell.caseCount === 0;
        }).length;
        const bUncovered = PURPOSES.filter((p) => {
          const cell = findCell(b.id, p);
          return cell?.applicable && cell.caseCount === 0;
        }).length;
        return bUncovered - aUncovered;
      });
    }
    if (sortBy === "path-asc") {
      return [...eps].sort((a, b) => a.path.localeCompare(b.path));
    }
    return eps;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div>
        {/* Filter toolbar */}
        <div className="flex items-center gap-3 mb-4">
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as "module" | "flat")}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="分组方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="module">按模块分组</SelectItem>
              <SelectItem value="flat">平铺显示</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="排序方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="uncovered-first">未覆盖优先</SelectItem>
              <SelectItem value="path-asc">路径 A→Z</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Matrix table */}
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="w-[240px] sticky left-0 bg-muted/30 z-10 text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                  接口
                </th>
                {PURPOSES.map((p) => (
                  <th
                    key={p}
                    className="text-center w-[80px] text-xs font-medium text-muted-foreground px-1 py-2"
                  >
                    {PURPOSE_LABELS[p]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(([groupName, groupEndpoints]) => (
                <Fragment key={groupName}>
                  {groupBy === "module" && (
                    <tr className="bg-muted/20">
                      <td
                        colSpan={PURPOSES.length + 1}
                        className="text-xs font-medium px-3 py-1.5 text-muted-foreground"
                      >
                        ▸ {groupName} ({groupEndpoints.length} 个接口)
                      </td>
                    </tr>
                  )}
                  {sortEndpoints(groupEndpoints).map((ep) => (
                    <tr key={ep.id} className="border-b last:border-0 hover:bg-accent/30">
                      <td className="sticky left-0 bg-background px-3 py-2">
                        <div className="flex items-center gap-2">
                          <MethodBadge method={ep.method} />
                          <span className="text-xs font-mono truncate">{ep.path}</span>
                        </div>
                      </td>
                      {PURPOSES.map((p) => {
                        const cell = findCell(ep.id, p);
                        const isUncovered =
                          cell?.applicable && cell.caseCount === 0;
                        const isPopoverOpen =
                          popoverState?.endpointId === ep.id &&
                          popoverState?.purpose === p;

                        const cellEl = (
                          <CoverageCell
                            cell={cell}
                            endpointLabel={`${ep.method} ${ep.path}`}
                            purposeLabel={PURPOSE_LABELS[p]}
                            onClick={
                              isUncovered
                                ? () =>
                                    setPopoverState({
                                      endpointId: ep.id,
                                      purpose: p,
                                    })
                                : undefined
                            }
                          />
                        );

                        return (
                          <td key={p} className="text-center p-1">
                            {isUncovered ? (
                              <GenerateCasePopover
                                endpointPath={ep.path}
                                endpointMethod={ep.method}
                                purpose={p}
                                purposeLabel={PURPOSE_LABELS[p]}
                                open={isPopoverOpen}
                                onOpenChange={(open) => {
                                  if (!open) setPopoverState(null);
                                }}
                              >
                                {cellEl}
                              </GenerateCasePopover>
                            ) : (
                              cellEl
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-green-500/20 border border-green-500/30" />
            充分(≥2)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-amber-500/20 border border-amber-500/30" />
            部分(1)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-red-500/20 border border-red-500/30 border-dashed" />
            未覆盖(0)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-muted/30" />
            不适用
          </span>
          <span className="text-[10px] ml-auto">[点击🔴快速生成]</span>
        </div>
      </div>
    </TooltipProvider>
  );
}
