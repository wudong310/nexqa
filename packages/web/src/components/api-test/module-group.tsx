import { EndpointRow } from "@/components/api-test/endpoint-row";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ApiEndpoint, TestCase, TestResult } from "@nexqa/shared";
import { ChevronDown, ChevronRight } from "lucide-react";
import type React from "react";

interface ModuleGroupEntry {
  endpoint: ApiEndpoint;
  cases: TestCase[];
}

interface ModuleGroupProps {
  mod: string;
  entries: ModuleGroupEntry[];
  isOpen: boolean;
  onToggleModule: (mod: string) => void;
  collapsedGroups: Record<string, boolean>;
  onToggleGroup: (epId: string) => void;
  checkedEpIds: Set<string>;
  onCheckEp: (epId: string, e: React.MouseEvent) => void;
  onViewEndpoint: (ep: ApiEndpoint) => void;
  onDeleteEndpoint: (id: string) => void;
  confirmDeleteEp: string | null;
  onConfirmDeleteEp: (id: string | null) => void;
  getLatestResult: (caseId: string) => TestResult | null;
  selectedCaseId: string | null;
  onSelectCase: (tc: TestCase) => void;
  onDeleteCase: (id: string) => void;
}

export function ModuleGroup({
  mod,
  entries,
  isOpen,
  onToggleModule,
  collapsedGroups,
  onToggleGroup,
  checkedEpIds,
  onCheckEp,
  onViewEndpoint,
  onDeleteEndpoint,
  confirmDeleteEp,
  onConfirmDeleteEp,
  getLatestResult,
  selectedCaseId,
  onSelectCase,
  onDeleteCase,
}: ModuleGroupProps) {
  const modTotal = entries.reduce((sum, e) => sum + e.cases.length, 0);

  return (
    <Card className="rounded-lg">
      {/* 模块标题 — Card Header */}
      <CardHeader
        className="flex flex-row items-center gap-2 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors select-none space-y-0"
        onClick={() => onToggleModule(mod)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) =>
          (e.key === "Enter" || e.key === " ") && onToggleModule(mod)
        }
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-semibold capitalize">{mod}</span>
        <Badge
          variant="secondary"
          className="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border-0 text-[10px] px-1.5 py-0"
        >
          {entries.length} 接口
        </Badge>
        <Badge
          variant="secondary"
          className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 border-0 text-[10px] px-1.5 py-0"
        >
          {modTotal} 用例
        </Badge>
      </CardHeader>

      {/* 模块内的接口列表 */}
      {isOpen && (
        <CardContent className="px-0 pb-0">
          <div className="divide-y">
            {entries.map(({ endpoint: ep, cases: groupCases }) => (
              <EndpointRow
                key={ep.id}
                endpoint={ep}
                cases={groupCases}
                collapsed={collapsedGroups[ep.id] ?? true}
                onToggle={onToggleGroup}
                checked={checkedEpIds.has(ep.id)}
                onCheck={onCheckEp}
                onView={onViewEndpoint}
                onDeleteEndpoint={onDeleteEndpoint}
                confirmingDelete={confirmDeleteEp === ep.id}
                onConfirmDelete={onConfirmDeleteEp}
                getLatestResult={getLatestResult}
                selectedCaseId={selectedCaseId}
                onSelectCase={onSelectCase}
                onDeleteCase={onDeleteCase}
              />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
