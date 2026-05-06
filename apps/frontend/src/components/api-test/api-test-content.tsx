import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ModuleGroup } from "@/components/api-test/module-group";
import type { ApiEndpoint, TestCase, TestResult } from "@nexqa/shared";

import { FileText, Upload } from "lucide-react";

interface ApiTestContentProps {
  projectId: string;
  endpoints: ApiEndpoint[];
  moduleGroups: Map<string, { endpoint: ApiEndpoint; cases: TestCase[] }[]>;
  openModule: string | null;
  onToggleModule: (mod: string) => void;
  collapsedGroups: Record<string, boolean>;
  onToggleGroup: (key: string) => void;
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

export function ApiTestContent({
  projectId,
  endpoints,
  moduleGroups,
  openModule,
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
}: ApiTestContentProps) {
  if (endpoints.length === 0) {
    return (
      <div className="flex-1 overflow-auto space-y-4">
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="还没有 API 接口"
          description="导入 OpenAPI 文档或手动创建接口，开始测试"
          action={
            <div className="flex items-center gap-2">
              <a href={`/nexqa/p/${projectId}/api?action=import`}>
                <Button>
                  <Upload className="h-4 w-4 mr-1" />
                  导入 OpenAPI 文档
                </Button>
              </a>
            </div>
          }
          secondaryAction={
            <Button variant="link" size="sm" className="text-muted-foreground">
              了解如何使用 →
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto space-y-4">
      {[...moduleGroups.entries()].map(([mod, entries]) => (
        <ModuleGroup
          key={mod}
          mod={mod}
          entries={entries}
          isOpen={openModule === mod}
          onToggleModule={onToggleModule}
          collapsedGroups={collapsedGroups}
          onToggleGroup={onToggleGroup}
          checkedEpIds={checkedEpIds}
          onCheckEp={onCheckEp}
          onViewEndpoint={onViewEndpoint}
          onDeleteEndpoint={onDeleteEndpoint}
          confirmDeleteEp={confirmDeleteEp}
          onConfirmDeleteEp={onConfirmDeleteEp}
          getLatestResult={getLatestResult}
          selectedCaseId={selectedCaseId}
          onSelectCase={onSelectCase}
          onDeleteCase={onDeleteCase}
        />
      ))}
    </div>
  );
}
