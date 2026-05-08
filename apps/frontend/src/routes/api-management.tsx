import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  useApiEndpointModules,
  useApiEndpoints,
  useDeleteApiEndpoint,
} from "@/hooks/use-api-documents";
import type { GitSource } from "@nexqa/shared";
import type { ModuleInfo } from "@/lib/api-documents";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import {
  AlertTriangle,
  Box,
  GitBranch,
  Layers,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EndpointListItem } from "@/components/api-management/endpoint-list-item";
import { EndpointDetailSheet } from "@/components/api-management/endpoint-detail-sheet";
import { cn } from "@/lib/utils";

// ── Git Source list response ────────────────────────

interface GitSourceListResponse {
  items: GitSource[];
}

// ── Main Page ───────────────────────────────────────

export function ApiManagementPage() {
  const { projectId } = useParams({ from: "/p/$projectId/api-management" });

  // ── Git Sources ──
  const {
    data: gitSourcesRaw,
    isLoading: gitSourcesLoading,
  } = useQuery<GitSourceListResponse | GitSource[]>({
    queryKey: ["git-sources", projectId],
    queryFn: () => api.get(`/git-sources?projectId=${projectId}`),
    enabled: !!projectId,
  });

  const gitSources: GitSource[] = Array.isArray(gitSourcesRaw)
    ? gitSourcesRaw
    : (gitSourcesRaw?.items ?? []);

  // ── Selection state ──
  const [selectedGitSourceId, setSelectedGitSourceId] = useState<string | undefined>(undefined);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [detailEndpointId, setDetailEndpointId] = useState<string | null>(null);
  const [confirmDeleteEpId, setConfirmDeleteEpId] = useState<string | null>(null);

  // ── Modules ──
  const {
    data: modules,
    isLoading: modulesLoading,
    error: modulesError,
  } = useApiEndpointModules(projectId, selectedGitSourceId);

  // ── Endpoints ──
  const endpointOpts = {
    gitSourceId: selectedGitSourceId,
    module: selectedModule ?? undefined,
  };
  const {
    data: endpoints,
    isLoading: endpointsLoading,
    error: endpointsError,
  } = useApiEndpoints(projectId, selectedModule ? endpointOpts : { gitSourceId: selectedGitSourceId });

  // ── Mutations ──
  const deleteEpMutation = useDeleteApiEndpoint();

  function handleDeleteEndpoint(epId: string) {
    setConfirmDeleteEpId(epId);
  }

  async function confirmDeleteEndpoint() {
    if (!confirmDeleteEpId) return;
    try {
      await deleteEpMutation.mutateAsync(confirmDeleteEpId);
      toast.success("端点已删除");
      setDetailEndpointId(null);
    } catch (err) {
      toast.error(`删除失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setConfirmDeleteEpId(null);
    }
  }

  // ── Handle Git Source change ──
  function handleGitSourceChange(value: string) {
    setSelectedGitSourceId(value === "__all__" ? undefined : value);
    setSelectedModule(null);
  }

  // ── Total endpoint count ──
  const totalCount = modules?.reduce((sum, m) => sum + m.count, 0) ?? 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between shrink-0 px-6 pt-6 pb-4">
        <div>
          <h1 className="text-2xl font-bold">API 管理</h1>
          <p className="text-sm text-muted-foreground">
            按 Git Source 和模块浏览 API 端点
          </p>
        </div>

        {/* Git Source Selector */}
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          {gitSourcesLoading ? (
            <Skeleton className="h-9 w-48" />
          ) : (
            <Select
              value={selectedGitSourceId ?? "__all__"}
              onValueChange={handleGitSourceChange}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="全部 Git Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全部 Git Source</SelectItem>
                {gitSources.map((gs) => (
                  <SelectItem key={gs.id} value={gs.id}>
                    {gs.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* ── Main content area ── */}
      <div className="flex-1 flex overflow-hidden px-6 pb-6 gap-4">
        {/* ── Left sidebar: Module list ── */}
        <div className="w-64 shrink-0 flex flex-col overflow-hidden border rounded-lg bg-card">
          <div className="px-4 py-3 border-b shrink-0">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">模块</span>
              {!modulesLoading && modules && (
                <Badge variant="secondary" className="text-xs ml-auto">
                  {modules.length}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {/* Loading */}
            {modulesLoading && (
              <div className="space-y-1 p-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            )}

            {/* Error */}
            {modulesError && (
              <div className="p-4 text-center">
                <AlertTriangle className="h-5 w-5 text-destructive mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">加载模块失败</p>
              </div>
            )}

            {/* Empty */}
            {!modulesLoading && !modulesError && modules && modules.length === 0 && (
              <div className="p-4 text-center">
                <Box className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">暂无模块</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  配置 Git Source 并触发扫描后，模块会自动出现
                </p>
              </div>
            )}

            {/* Module items */}
            {!modulesLoading && !modulesError && modules && modules.length > 0 && (
              <div className="p-2 space-y-0.5">
                {/* "All" item */}
                <ModuleListItem
                  name="全部"
                  count={totalCount}
                  active={selectedModule === null}
                  onClick={() => setSelectedModule(null)}
                />
                {modules.map((m) => (
                  <ModuleListItem
                    key={m.module}
                    name={m.module}
                    count={m.count}
                    active={selectedModule === m.module}
                    onClick={() => setSelectedModule(m.module)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Endpoint list ── */}
        <div className="flex-1 flex flex-col overflow-hidden border rounded-lg bg-card">
          <div className="px-4 py-3 border-b shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {selectedModule ? `模块：${selectedModule}` : "全部端点"}
              </span>
              {!endpointsLoading && endpoints && (
                <Badge variant="secondary" className="text-xs">
                  {endpoints.length}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {/* Loading */}
            {endpointsLoading && (
              <div className="space-y-1 p-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            )}

            {/* Error */}
            {endpointsError && (
              <div className="p-6 text-center">
                <AlertTriangle className="h-6 w-6 text-destructive mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">加载端点失败</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {endpointsError.message}
                </p>
              </div>
            )}

            {/* Empty */}
            {!endpointsLoading && !endpointsError && endpoints && endpoints.length === 0 && (
              <EmptyState
                icon={<Box className="h-10 w-10" />}
                title="暂无端点"
                description={
                  selectedModule
                    ? `模块「${selectedModule}」下没有 API 端点`
                    : "暂无 API 端点，请配置 Git Source 并触发扫描"
                }
                className="py-12"
              />
            )}

            {/* Endpoint list */}
            {!endpointsLoading && !endpointsError && endpoints && endpoints.length > 0 && (
              <div className="p-2">
                {endpoints.map((ep) => (
                  <EndpointListItem
                    key={ep.id}
                    endpoint={ep}
                    testCaseCount={0}
                    onView={() => setDetailEndpointId(ep.id)}
                    onDelete={() => handleDeleteEndpoint(ep.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Sheets & Dialogs ── */}
      <EndpointDetailSheet
        endpointId={detailEndpointId}
        open={!!detailEndpointId}
        onOpenChange={(open) => {
          if (!open) setDetailEndpointId(null);
        }}
        onDelete={handleDeleteEndpoint}
      />

      {/* Delete endpoint confirmation */}
      <AlertDialog
        open={!!confirmDeleteEpId}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteEpId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除端点</AlertDialogTitle>
            <AlertDialogDescription>
              删除此端点后，关联的测试用例将标记为"API 已删除"。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteEndpoint}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Module List Item ────────────────────────────────

function ModuleListItem({
  name,
  count,
  active,
  onClick,
}: {
  name: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition-colors",
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-foreground hover:bg-muted/50",
      )}
      onClick={onClick}
    >
      <span className="truncate flex-1">{name}</span>
      <Badge
        variant={active ? "default" : "secondary"}
        className="text-xs shrink-0"
      >
        {count}
      </Badge>
    </button>
  );
}
