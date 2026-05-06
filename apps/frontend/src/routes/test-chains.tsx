import { ChainCard } from "@/components/test-chains/chain-card";
import { ChainEditor } from "@/components/test-chains/chain-editor";
import { ChainExecutionResultView } from "@/components/test-chains/chain-execution-result";
import { ChainGenSheet } from "@/components/chain-gen/chain-gen-sheet";
import { ExecutionProgressPanel } from "@/components/execution-progress/execution-progress-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type ChainExecutionResult,
  useCreateTestChain,
  useDeleteTestChain,
  useExecuteTestChain,
  useTestChains,
  useUpdateTestChain,
} from "@/hooks/use-test-chains";
import { api } from "@/lib/api";
import type { CreateTestChain, TestCase, TestChain } from "@nexqa/shared";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Link2, Plus, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

// ── Main Page ───────────────────────────────────────

type ViewMode = "list" | "create" | "edit" | "result";

export function TestChainsPage() {
  const { projectId } = useParams({ from: "/p/$projectId/chains" });

  // State
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingChain, setEditingChain] = useState<TestChain | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [executionResult, setExecutionResult] =
    useState<ChainExecutionResult | null>(null);
  const [executingBatchRunId, setExecutingBatchRunId] = useState<string | null>(
    null,
  );
  const [showChainGen, setShowChainGen] = useState(false);

  // Queries
  const { data: chains = [], isLoading: chainsLoading } =
    useTestChains(projectId);
  const { data: testCases = [] } = useQuery<TestCase[]>({
    queryKey: ["test-cases", projectId],
    queryFn: () => api.get(`/test-cases?projectId=${projectId}`),
    enabled: !!projectId,
  });

  // Mutations
  const createMutation = useCreateTestChain(projectId);
  const updateMutation = useUpdateTestChain(projectId);
  const deleteMutation = useDeleteTestChain(projectId);
  const executeMutation = useExecuteTestChain();

  // Case map
  const caseMap = useMemo(() => {
    const m = new Map<string, TestCase>();
    for (const tc of testCases) m.set(tc.id, tc);
    return m;
  }, [testCases]);

  // Handlers
  function handleCreate(data: CreateTestChain) {
    createMutation.mutate(data, {
      onSuccess: () => {
        toast.success("测试链已创建");
        setViewMode("list");
      },
      onError: (error) => {
        toast.error(
          `创建失败: ${error instanceof Error ? error.message : "未知错误"}`,
        );
      },
    });
  }

  function handleUpdate(data: CreateTestChain) {
    if (!editingChain) return;
    updateMutation.mutate(
      { id: editingChain.id, data },
      {
        onSuccess: () => {
          toast.success("测试链已更新");
          setViewMode("list");
        },
        onError: (error) => {
          toast.error(
            `更新失败: ${error instanceof Error ? error.message : "未知错误"}`,
          );
        },
      },
    );
  }

  function handleDelete(chainId: string) {
    deleteMutation.mutate(chainId, {
      onSuccess: () => {
        toast.success("测试链已删除");
        setConfirmDeleteId(null);
      },
      onError: (error) => {
        toast.error(
          `删除失败: ${error instanceof Error ? error.message : "未知错误"}`,
        );
      },
    });
  }

  function handleExecute(chain: TestChain) {
    executeMutation.mutate(
      { chainId: chain.id },
      {
        onSuccess: (result) => {
          toast.success("测试链执行完成");
          setExecutionResult(result);
          if (result.batchRunId) {
            setExecutingBatchRunId(result.batchRunId);
          }
          setViewMode("result");
        },
        onError: (error) => {
          toast.error(
            `测试链执行失败: ${error instanceof Error ? error.message : "未知错误"}`,
          );
        },
      },
    );
  }

  function openEdit(chain: TestChain) {
    setEditingChain(chain);
    setViewMode("edit");
  }

  function openCreate() {
    setEditingChain(null);
    setViewMode("create");
  }

  // Loading state — Skeleton
  if (chainsLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-48 mt-1" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48 mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-3 w-full mt-2" />
                <div className="flex gap-2 mt-3">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-16" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Create/Edit view — full width for the new panel layout
  if (viewMode === "create" || viewMode === "edit") {
    return (
      <ChainEditor
        chain={viewMode === "edit" ? editingChain : null}
        testCases={testCases}
        onSave={viewMode === "edit" ? handleUpdate : handleCreate}
        onExecute={
          viewMode === "edit" && editingChain
            ? () => handleExecute(editingChain)
            : undefined
        }
        onBack={() => setViewMode("list")}
        isSaving={createMutation.isPending || updateMutation.isPending}
        isExecuting={executeMutation.isPending}
      />
    );
  }

  // Execution result view
  if (viewMode === "result" && executionResult) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">执行结果</h1>
          <Button variant="outline" onClick={() => setViewMode("list")}>
            返回链列表
          </Button>
        </div>

        {executingBatchRunId && (
          <ExecutionProgressPanel batchRunId={executingBatchRunId} />
        )}

        <ChainExecutionResultView result={executionResult} caseMap={caseMap} />
      </div>
    );
  }

  // List view
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">测试链</h1>
          <p className="text-sm text-muted-foreground">
            编排多个用例，实现变量传递和全链路测试
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowChainGen(true)}
            className="gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50 hover:border-violet-300 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950/30"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI 生成测试链
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            新建测试链
          </Button>
        </div>
      </div>

      {/* Chain list */}
      {chains.length === 0 ? (
        <EmptyState
          icon={<Link2 className="h-12 w-12" />}
          title="还没有测试链"
          description="创建测试链，实现用例间的变量传递，如 CRUD 全链路测试"
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              新建测试链
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {chains.map((chain) => (
            <ChainCard
              key={chain.id}
              chain={chain}
              onEdit={() => openEdit(chain)}
              onDelete={() => setConfirmDeleteId(chain.id)}
              onExecute={() => handleExecute(chain)}
              isExecuting={
                executeMutation.isPending &&
                executeMutation.variables?.chainId === chain.id
              }
            />
          ))}
        </div>
      )}

      {/* Delete confirm dialog */}
      <Dialog
        open={!!confirmDeleteId}
        onOpenChange={() => setConfirmDeleteId(null)}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>删除测试链</DialogTitle>
            <DialogDescription>
              确定要删除这个测试链吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteId(null)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
              disabled={deleteMutation.isPending}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Chain Gen Sheet */}
      <ChainGenSheet
        open={showChainGen}
        onOpenChange={setShowChainGen}
        projectId={projectId}
        onEditChain={(chainId) => {
          const chain = chains.find((c) => c.id === chainId);
          if (chain) openEdit(chain);
        }}
        onError={(error) => toast.error(`链路生成失败: ${error.message}`)}
      />
    </div>
  );
}
