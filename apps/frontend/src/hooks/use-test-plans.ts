import { api } from "@/lib/api";
import type { CreateTestPlan, TestPlan, UpdateTestPlan } from "@nexqa/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// ── Query Keys ──────────────────────────────────────

export const testPlanKeys = {
  all: (projectId: string) => ["test-plans", projectId] as const,
  detail: (planId: string) => ["test-plan", planId] as const,
};

// ── Queries ─────────────────────────────────────────

export function useTestPlans(projectId: string) {
  return useQuery<TestPlan[]>({
    queryKey: testPlanKeys.all(projectId),
    queryFn: () => api.get(`/test-plans?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export function useTestPlan(planId: string | null) {
  return useQuery<TestPlan>({
    queryKey: testPlanKeys.detail(planId ?? ""),
    queryFn: () => api.get(`/test-plans/detail?id=${planId}`),
    enabled: !!planId,
  });
}

// ── Mutations ───────────────────────────────────────

export function useCreateTestPlan(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTestPlan) =>
      api.post<TestPlan>("/test-plans", { ...data, projectId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: testPlanKeys.all(projectId) });
      toast.success("测试方案已创建");
    },
    onError: (err: Error) => toast.error(`创建失败：${err.message}`),
  });
}

export function useUpdateTestPlan(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTestPlan }) =>
      api.post<TestPlan>('/test-plans/update', { id, ...data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: testPlanKeys.all(projectId) });
      toast.success("测试方案已更新");
    },
    onError: (err: Error) => toast.error(`更新失败：${err.message}`),
  });
}

export function useDeleteTestPlan(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => api.post('/test-plans/delete', { id: planId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: testPlanKeys.all(projectId) });
      toast.success("测试方案已删除");
    },
    onError: (err: Error) => toast.error(`删除失败：${err.message}`),
  });
}

export function useExecuteTestPlan() {
  return useMutation({
    mutationFn: (planId: string) =>
      api.post<{ message: string; planId: string }>('/test-plans/run', { id: planId }),
    onSuccess: () => {
      toast.success("方案执行已触发");
    },
    onError: (err: Error) => toast.error(`执行失败：${err.message}`),
  });
}
