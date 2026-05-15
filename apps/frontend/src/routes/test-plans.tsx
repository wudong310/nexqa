import { AdoptConfirmDialog } from "@/components/plan-gen-v2/AdoptConfirmDialog";
import { FloatingProgressIndicator } from "@/components/plan-gen-v2/FloatingProgressIndicator";
import { PlanGenRecordsSection } from "@/components/plan-gen-v2/PlanGenRecordsSection";
import { PlanGenV2Dialog, type ScopeChoice } from "@/components/plan-gen-v2/PlanGenV2Dialog";
import { PlanCard } from "@/components/test-plans/plan-card";
import { PlanDetailView } from "@/components/test-plans/plan-detail-view";
import { PlanFormDialog } from "@/components/test-plans/plan-form-dialog";
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
  TooltipProvider,
} from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { usePlanGenRecords } from "@/hooks/usePlanGenRecords";
import {
  useCreateTestPlan,
  useDeleteTestPlan,
  useExecuteTestPlan,
  useTestPlans,
  useUpdateTestPlan,
} from "@/hooks/use-test-plans";
import type { CreateTestPlan, TestPlan, Project } from "@nexqa/shared";
import type { PlanGenRecord } from "@/types/plan-gen-v2";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Loader2, Wand2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

// ── Quick templates ─────────────────────────────────

const QUICK_TEMPLATES: { name: string; icon: string; data: CreateTestPlan }[] = [
  {
    name: "冒烟快测",
    icon: "🔥",
    data: {
      name: "冒烟快测",
      description: "只跑 smoke + P0 用例，快速验证核心路径",
      selection: {
        tags: { phase: ["smoke"], priority: ["P0"] },
      },
      execution: {
        environmentId: null,
        stages: false,
        concurrency: 1,
        retryOnFail: 0,
        timeoutMs: 30000,
        stopOnGateFail: false,
      },
      criteria: { minPassRate: 1.0, maxP0Fails: 0, maxP1Fails: 0 },
    },
  },
  {
    name: "功能回归",
    icon: "🔄",
    data: {
      name: "功能回归",
      description: "回归 + 完整阶段用例，开启门禁",
      selection: {
        tags: { phase: ["regression", "full"] },
      },
      execution: {
        environmentId: null,
        stages: true,
        concurrency: 3,
        retryOnFail: 0,
        timeoutMs: 30000,
        stopOnGateFail: true,
      },
      criteria: { minPassRate: 0.95, maxP0Fails: 0, maxP1Fails: 3 },
    },
  },
  {
    name: "全量测试",
    icon: "📦",
    data: {
      name: "全量测试",
      description: "执行所有用例，高并发",
      selection: {},
      execution: {
        environmentId: null,
        stages: true,
        concurrency: 5,
        retryOnFail: 1,
        timeoutMs: 30000,
        stopOnGateFail: true,
      },
      criteria: { minPassRate: 0.9, maxP0Fails: 0, maxP1Fails: 5 },
    },
  },
];

// ── URL Search Params hook ──────────────────────────

function useViewParam(): [string | null, (id: string | null) => void] {
  // #10: Use URL search params for detail view routing
  const [params, setParams] = useState<URLSearchParams>(
    () => new URLSearchParams(window.location.search),
  );

  const viewId = params.get("view");

  const setViewId = useCallback(
    (id: string | null) => {
      const url = new URL(window.location.href);
      if (id) {
        url.searchParams.set("view", id);
      } else {
        url.searchParams.delete("view");
      }
      window.history.pushState({}, "", url.toString());
      setParams(new URLSearchParams(url.search));
    },
    [],
  );

  // Listen for popstate (browser back/forward)
  useState(() => {
    const handler = () => {
      setParams(new URLSearchParams(window.location.search));
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  });

  return [viewId, setViewId];
}

// ── Main Page ───────────────────────────────────────

export function TestPlansPage() {
  const { projectId } = useParams({ from: "/p/$projectId/plans" });
  const navigate = useNavigate();

  // #10: URL-based detail view
  const [viewPlanId, setViewPlanId] = useViewParam();

  // State
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<TestPlan | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // V2 plan gen state
  const [v2DialogOpen, setV2DialogOpen] = useState(false);
  const [adoptDialogOpen, setAdoptDialogOpen] = useState(false);
  const [adoptingRecord, setAdoptingRecord] = useState<PlanGenRecord | null>(null);
  const [retryIntent, setRetryIntent] = useState<string | undefined>(undefined);
  const [retryScope, setRetryScope] = useState<ScopeChoice | undefined>(undefined);

  // Queries & mutations
  const { data: project } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: () => api.get(`/projects/detail?id=${projectId}`),
  });
  const openclawConnectionId = project?.openclawConnections?.[0]?.id ?? null;

  const { data: plans = [], isLoading } = useTestPlans(projectId);
  const { data: genRecords = [] } = usePlanGenRecords(projectId);
  const createMutation = useCreateTestPlan(projectId);
  const updateMutation = useUpdateTestPlan(projectId);
  const deleteMutation = useDeleteTestPlan(projectId);
  const executeMutation = useExecuteTestPlan();

  // Find viewing plan from URL param
  const viewingPlan = useMemo(
    () => (viewPlanId ? plans.find((p) => p.id === viewPlanId) ?? null : null),
    [viewPlanId, plans],
  );

  // Find generating record for floating indicator
  const generatingRecord = useMemo(
    () => genRecords.find((r) => r.status === "generating") ?? null,
    [genRecords]
  );

  // Handlers
  function openEdit(plan: TestPlan) {
    setEditingPlan(plan);
    setFormOpen(true);
  }

  function handleSubmit(data: CreateTestPlan) {
    if (editingPlan) {
      updateMutation.mutate(
        { id: editingPlan.id, data },
        {
          onSuccess: () => {
            toast.success("方案已更新");
            setFormOpen(false);
            if (viewPlanId === editingPlan.id) {
              setViewPlanId(null);
            }
          },
          onError: (error) => {
            toast.error(
              `更新失败: ${error instanceof Error ? error.message : "未知错误"}`,
            );
          },
        },
      );
    } else {
      createMutation.mutate(data, {
        onSuccess: () => {
          toast.success("方案已创建");
          setFormOpen(false);
        },
        onError: (error) => {
          toast.error(
            `创建失败: ${error instanceof Error ? error.message : "未知错误"}`,
          );
        },
      });
    }
  }

  function handleDelete(planId: string) {
    deleteMutation.mutate(planId, {
      onSuccess: () => {
        toast.success("方案已删除");
        setConfirmDeleteId(null);
        if (viewPlanId === planId) setViewPlanId(null);
      },
      onError: (error) => {
        toast.error(
          `删除失败: ${error instanceof Error ? error.message : "未知错误"}`,
        );
      },
    });
  }

  // #14: Toast + action instead of immediate navigate
  function handleExecute(plan: TestPlan) {
    executeMutation.mutate(plan.id, {
      onSuccess: () => {
        toast.success("方案开始执行", {
          action: {
            label: "查看进度",
            onClick: () =>
              navigate({
                to: "/p/$projectId/history" as any, // [HIDDEN] route disabled
                params: { projectId } as any,
              }),
          },
          duration: 5000,
        });
      },
      onError: (error) => {
        toast.error(
          `方案执行失败: ${error instanceof Error ? error.message : "未知错误"}`,
        );
      },
    });
  }

  function handleCreateFromTemplate(template: CreateTestPlan) {
    createMutation.mutate(template, {
      onSuccess: () => {
        toast.success(`模板「${template.name}」已创建`);
      },
      onError: (error) => {
        toast.error(
          `模板创建失败: ${error instanceof Error ? error.message : "未知错误"}`,
        );
      },
    });
  }

  // Handle adopt from records section
  function handleAdopt(record: PlanGenRecord) {
    setAdoptingRecord(record);
    setAdoptDialogOpen(true);
  }

  // Handle retry from records section
  function handleRetry(record: PlanGenRecord) {
    setRetryIntent(record.intent);
    setRetryScope(record.scope?.changedOnly ? "changed" : "all");
    setV2DialogOpen(true);
  }

  // Clear retry state when dialog closes
  function handleV2DialogOpenChange(open: boolean) {
    setV2DialogOpen(open);
    if (!open) {
      setRetryIntent(undefined);
      setRetryScope(undefined);
    }
  }

  // #8 P0: Loading state — Skeleton
  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-48 mt-1" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3].map((i) => (
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
                  <Skeleton className="h-5 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Detail view (from URL param)
  if (viewingPlan) {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="p-6 max-w-4xl mx-auto">
          <PlanDetailView
            plan={viewingPlan}
            projectId={projectId}
            onBack={() => setViewPlanId(null)}
            onEdit={() => openEdit(viewingPlan)}
            onExecute={() => handleExecute(viewingPlan)}
            isExecuting={executeMutation.isPending}
          />
        </div>
        {/* Floating indicator also visible in detail view */}
        <FloatingProgressIndicator
          record={generatingRecord}
          onClick={() => setV2DialogOpen(true)}
        />
      </TooltipProvider>
    );
  }

  // List view
  return (
    <TooltipProvider delayDuration={0}>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">测试方案</h1>
            <p className="text-sm text-muted-foreground">
              创建可复用的测试执行配方
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setV2DialogOpen(true)}
            className="gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
          >
            <Wand2 className="h-3.5 w-3.5" />
            ✨ AI 智能生成(V2)
          </Button>
        </div>

        {/* AI Generation Records Section */}
        <PlanGenRecordsSection
          projectId={projectId}
          onOpenV2Dialog={() => setV2DialogOpen(true)}
          onAdopt={handleAdopt}
          onRetry={handleRetry}
        />

        {/* Plan list */}
        {plans.length === 0 ? (
          <div className="text-center py-8 space-y-4">
            <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto" />
            <div>
              <h3 className="text-base font-semibold">还没有测试方案</h3>
              <p className="text-sm text-muted-foreground mt-1">
                使用 AI 智能生成或从模板快速创建
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onEdit={() => openEdit(plan)}
                onDelete={() => setConfirmDeleteId(plan.id)}
                onExecute={() => handleExecute(plan)}
                onViewDetail={() => setViewPlanId(plan.id)}
                isExecuting={
                  executeMutation.isPending &&
                  executeMutation.variables === plan.id
                }
              />
            ))}
          </div>
        )}

        {/* #13 P2: Quick templates — always visible */}
        <div className="border-t pt-4 space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            从模板创建
          </h3>
          <div className="flex flex-wrap gap-2">
            {QUICK_TEMPLATES.map((tpl) => (
              <Button
                key={tpl.name}
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => handleCreateFromTemplate(tpl.data)}
                disabled={createMutation.isPending}
              >
                {tpl.icon} {tpl.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Form dialog */}
        <PlanFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          plan={editingPlan}
          onSubmit={handleSubmit}
          isPending={createMutation.isPending || updateMutation.isPending}
        />

        {/* Delete confirm */}
        <Dialog
          open={!!confirmDeleteId}
          onOpenChange={() => setConfirmDeleteId(null)}
        >
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>删除测试方案</DialogTitle>
              <DialogDescription>
                确定要删除这个测试方案吗？此操作不可撤销。
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
                onClick={() =>
                  confirmDeleteId && handleDelete(confirmDeleteId)
                }
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* V2 Plan Gen Dialog */}
        <PlanGenV2Dialog
          open={v2DialogOpen}
          onOpenChange={handleV2DialogOpenChange}
          projectId={projectId}
          openclawConnectionId={openclawConnectionId}
          initialIntent={retryIntent}
          initialScope={retryScope}
        />

        {/* Adopt Confirm Dialog */}
        <AdoptConfirmDialog
          open={adoptDialogOpen}
          onOpenChange={setAdoptDialogOpen}
          record={adoptingRecord}
          projectId={projectId}
        />

        {/* Floating Progress Indicator */}
        <FloatingProgressIndicator
          record={generatingRecord}
          onClick={() => setV2DialogOpen(true)}
        />
      </div>
    </TooltipProvider>
  );
}