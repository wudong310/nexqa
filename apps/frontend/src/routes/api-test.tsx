import {
  EMPTY_TAG_FILTER,
  type TagFilter,
} from "@/components/tag-filter-bar";
import { safeTags } from "@/components/tag-editor";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useApiTestData } from "@/hooks/use-api-test-data";
import { useApiTestShortcuts } from "@/hooks/use-api-test-shortcuts";
import type {
  ApiEndpoint,
  TestCase,
  TestCaseTags,
  TestResult,
} from "@nexqa/shared";
import { useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiTestContent } from "@/components/api-test/api-test-content";
import { ApiTestToolbar } from "@/components/api-test/api-test-toolbar";
import { CaseDetailSheet } from "@/components/api-test/case-detail-sheet";
import { EndpointDetailSheet } from "@/components/api-test/endpoint-detail-sheet";
import { ManualCaseDialog } from "@/components/api-test/manual-case-dialog";
import { AddEndpointSheet } from "@/components/api-test/add-endpoint-sheet";
import { ImportApiSheet } from "@/components/api-test/import-api-sheet";
import { CaseGenSheet } from "@/components/ai/case-gen-sheet";
import { Globe, Loader2, Sparkles, Upload } from "lucide-react";

export function ApiTestPage() {
  const { projectId } = useParams({ from: "/p/$projectId/api" });
  const { resolvedTheme } = useTheme();

  // ── UI state ──
  const [selectedCase, setSelectedCase] = useState<TestCase | null>(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);
  const [editingEndpoint, setEditingEndpoint] = useState(false);
  const [editorValue, setEditorValue] = useState("");
  const [tagFilter, setTagFilter] = useState<TagFilter>(EMPTY_TAG_FILTER);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingTags, setEditingTags] = useState<TestCaseTags | null>(null);
  const [execResult, setExecResult] = useState<TestResult | null>(null);
  const [checkedEpIds, setCheckedEpIds] = useState<Set<string>>(new Set());
  const [confirmDeleteEp, setConfirmDeleteEp] = useState<string | null>(null);
  const [manualCaseOpen, setManualCaseOpen] = useState(false);
  const [addEndpointOpen, setAddEndpointOpen] = useState(false);
  const [importApiOpen, setImportApiOpen] = useState(false);

  // auto-open import sheet from ?action=import
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") === "import") {
      setImportApiOpen(true);
      // clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const [showCaseGen, setShowCaseGen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [openModule, setOpenModule] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Data layer ──
  const {
    project,
    endpoints,
    moduleGroups,
    visibleStats,
    filterActive,
    getLatestResult,
    generateMutation,
    updateMutation,
    deleteCaseMutation,
    updateEndpointMutation,
    deleteEndpointMutation,
    execMutation,
    handleDeleteChecked,
  } = useApiTestData({
    projectId,
    tagFilter,
    searchQuery,
    onCaseDeleted: () => setSelectedCase(null),
    onEndpointDeleted: () => {
      setSelectedCase(null);
      setSelectedEndpoint(null);
      setConfirmDeleteEp(null);
    },
    onEndpointUpdated: () => setEditingEndpoint(false),
    onExecResult: (result) => setExecResult(result),
  });

  // ── Default open first module ──
  useEffect(() => {
    if (openModule === null && moduleGroups.size > 0) {
      setOpenModule([...moduleGroups.keys()][0]);
    }
  }, [moduleGroups, openModule]);

  // ── Handlers ──
  function selectCase(tc: TestCase) {
    setSelectedCase(tc);
    setSelectedEndpoint(null);
    setEditingEndpoint(false);
    setEditorValue(
      JSON.stringify({ request: tc.request, expected: tc.expected }, null, 2),
    );
    setEditingTags(safeTags(tc.tags));
    setExecResult(getLatestResult(tc.id));
  }

  function viewEndpoint(ep: ApiEndpoint) {
    setSelectedEndpoint(ep);
    setSelectedCase(null);
    setEditingEndpoint(false);
    const { id: _id, projectId: _pid, createdAt: _ca, updatedAt: _ua, ...rest } = ep;
    setEditorValue(JSON.stringify(rest, null, 2));
  }

  function toggleCheckEp(epId: string, e: React.MouseEvent) {
    e.stopPropagation();
    setCheckedEpIds((prev) => {
      const next = new Set(prev);
      if (next.has(epId)) next.delete(epId);
      else next.add(epId);
      return next;
    });
  }

  function saveEndpointChanges() {
    if (!selectedEndpoint) return;
    try {
      const parsed = JSON.parse(editorValue);
      updateEndpointMutation.mutate({ id: selectedEndpoint.id, data: parsed });
    } catch {
      toast.error("JSON 格式无效，请检查编辑器内容");
    }
  }

  function saveEditorChanges() {
    if (!selectedCase) return;
    try {
      const parsed = JSON.parse(editorValue);
      updateMutation.mutate({ id: selectedCase.id, data: { request: parsed.request, expected: parsed.expected } });
    } catch {
      toast.error("JSON 格式无效，请检查编辑器内容");
    }
  }

  function saveTagChanges(tc: TestCase) {
    if (!editingTags) return;
    updateMutation.mutate({ id: tc.id, data: { tags: editingTags } });
  }

  function handleSaveCase() {
    if (!selectedCase) return;
    saveTagChanges(selectedCase);
    saveEditorChanges();
  }

  function handleExecuteCase() {
    if (!selectedCase) return;
    try {
      const parsed = JSON.parse(editorValue);
      execMutation.mutate({
        ...selectedCase,
        request: parsed.request,
        expected: parsed.expected,
      });
    } catch {
      execMutation.mutate(selectedCase);
    }
  }

  function onGenerateSelected() {
    setShowCaseGen(true);
  }

  async function onDeleteChecked() {
    await handleDeleteChecked(checkedEpIds);
    setCheckedEpIds(new Set());
  }

  const isOffline = project && !project.baseURL;

  // ── Keyboard shortcuts ──
  useApiTestShortcuts({
    searchInputRef,
    selectedCase,
    selectedEndpoint,
    editorValue,
    execMutation,
    endpoints,
    generatePending: generateMutation.isPending,
    onGenerateSelected,
    onClearCase: () => setSelectedCase(null),
    onClearEndpoint: () => setSelectedEndpoint(null),
  });

  // ── Render ──
  return (
    <TooltipProvider delayDuration={0}>
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden p-6 space-y-4">
        {/* 离线提示 */}
        {project && isOffline && (
          <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg px-4 py-2 text-xs text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />
            项目离线 — 可浏览接口和用例，但无法执行测试
          </div>
        )}

        {/* ── 页面头部：标题 + 操作按钮 ── */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-2xl font-bold">测试用例</h1>
            <p className="text-sm text-muted-foreground">
              管理和验证 API 接口的测试用例
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    onClick={onGenerateSelected}
                    disabled={generateMutation.isPending || endpoints.length === 0}
                    className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white dark:bg-violet-700 dark:hover:bg-violet-600"
                  >
                    {generateMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {checkedEpIds.size > 0
                      ? `AI 生成选中 (${checkedEpIds.size})`
                      : filterActive
                        ? "AI 生成筛选结果"
                        : "AI 生成用例"}
                  </Button>
                </span>
              </TooltipTrigger>
              {endpoints.length === 0 && (
                <TooltipContent>请先导入或创建接口</TooltipContent>
              )}
            </Tooltip>
            <Button size="sm" variant="outline" onClick={() => setAddEndpointOpen(true)}>
              <Globe className="h-3.5 w-3.5 mr-1" />
              添加 API
            </Button>
            <Button size="sm" variant="outline" onClick={() => setImportApiOpen(true)}>
              <Upload className="h-3.5 w-3.5 mr-1" />
              导入 API
            </Button>
          </div>
        </div>

        {/* ── 搜索和筛选栏（独立行） ── */}
        <div className="shrink-0">
          <ApiTestToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchInputRef={searchInputRef}
            tagFilter={tagFilter}
            onTagFilterChange={setTagFilter}
            onDeleteChecked={onDeleteChecked}
            isDeleting={deleteEndpointMutation.isPending}
            checkedCount={checkedEpIds.size}
            stats={visibleStats}
          />
        </div>

        {/* ── 接口列表 ── */}
        <ApiTestContent
          projectId={projectId}
          endpoints={endpoints}
          moduleGroups={moduleGroups}
          openModule={openModule}
          onToggleModule={(m) => setOpenModule((prev) => (prev === m ? null : m))}
          collapsedGroups={collapsedGroups}
          onToggleGroup={(key) =>
            setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
          }
          checkedEpIds={checkedEpIds}
          onCheckEp={toggleCheckEp}
          onViewEndpoint={viewEndpoint}
          onDeleteEndpoint={(id) => deleteEndpointMutation.mutate(id)}
          confirmDeleteEp={confirmDeleteEp}
          onConfirmDeleteEp={setConfirmDeleteEp}
          getLatestResult={getLatestResult}
          selectedCaseId={selectedCase?.id ?? null}
          onSelectCase={selectCase}
          onDeleteCase={(id) => deleteCaseMutation.mutate(id)}
        />
      </div>

      <EndpointDetailSheet
        endpoint={selectedEndpoint}
        open={!!selectedEndpoint && !selectedCase}
        onOpenChange={(open) => { if (!open) setSelectedEndpoint(null); }}
        editingEndpoint={editingEndpoint}
        onSetEditingEndpoint={setEditingEndpoint}
        editorValue={editorValue}
        onEditorChange={setEditorValue}
        onSave={saveEndpointChanges}
        onDelete={(id) => deleteEndpointMutation.mutate(id)}
        onCancelEdit={() => {
          setEditingEndpoint(false);
          if (selectedEndpoint) viewEndpoint(selectedEndpoint);
        }}
        resolvedTheme={resolvedTheme ?? "light"}
      />

      <CaseDetailSheet
        testCase={selectedCase}
        open={!!selectedCase}
        onOpenChange={(open) => { if (!open) setSelectedCase(null); }}
        editorValue={editorValue}
        onEditorChange={setEditorValue}
        editingTags={editingTags}
        onEditingTagsChange={setEditingTags}
        onSave={handleSaveCase}
        onExecute={handleExecuteCase}
        isExecuting={execMutation.isPending}
        execResult={execResult}
        resolvedTheme={resolvedTheme ?? "light"}
      />
    </div>

    <ManualCaseDialog
      open={manualCaseOpen}
      onOpenChange={setManualCaseOpen}
      endpoints={endpoints}
      projectId={projectId}
    />
    <AddEndpointSheet
      open={addEndpointOpen}
      onOpenChange={setAddEndpointOpen}
      projectId={projectId}
    />
    <ImportApiSheet
      open={importApiOpen}
      onOpenChange={setImportApiOpen}
      projectId={projectId}
    />
    <CaseGenSheet
      open={showCaseGen}
      onOpenChange={setShowCaseGen}
      projectId={projectId}
      endpoints={checkedEpIds.size > 0 ? endpoints.filter((ep) => checkedEpIds.has(ep.id)) : endpoints}
    />
    </TooltipProvider>
  );
}
