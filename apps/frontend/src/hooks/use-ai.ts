import { api } from "@/lib/api";
import type { BatchAnalysis, SmokeTaskStatus, CorePath } from "@/types/ai";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// ── Analysis Hooks ──────────────────────────────────────

export function useBatchAnalysis(batchRunId: string | undefined) {
  return useQuery<BatchAnalysis>({
    queryKey: ["analysis", batchRunId],
    queryFn: () => api.post('/analysis/batch/result', { batchRunId }),
    enabled: !!batchRunId,
    retry: false,
  });
}

export function useTriggerBatchAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batchRunId: string) =>
      api.post<{ analysisId: string; status: string }>(
        '/analysis/batch',
        { batchRunId },
      ),
    onSuccess: (_, batchRunId) => {
      queryClient.invalidateQueries({
        queryKey: ["analysis", batchRunId],
      });
    },
    onError: (error) => {
      toast.error(`触发批量分析失败: ${error instanceof Error ? error.message : '未知错误'}`);
    },
  });
}

export function useCaseAnalysis(testResultId: string | undefined) {
  return useQuery<BatchAnalysis>({
    queryKey: ["analysis", "case", testResultId],
    queryFn: () => api.post('/analysis/case/result', { testResultId }),
    enabled: !!testResultId,
    retry: false,
  });
}

export function useTriggerCaseAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (testResultId: string) =>
      api.post<{ analysisId: string; status: string }>(
        '/analysis/case',
        { testResultId },
      ),
    onSuccess: (_, testResultId) => {
      queryClient.invalidateQueries({
        queryKey: ["analysis", "case", testResultId],
      });
    },
    onError: (error) => {
      toast.error(`触发用例分析失败: ${error instanceof Error ? error.message : '未知错误'}`);
    },
  });
}

// ── Smoke Hooks ─────────────────────────────────────────

export function useSmokeGenerate(projectId: string) {
  return useMutation({
    mutationFn: (environmentId?: string) =>
      api.post<{
        taskId: string;
        corePaths: CorePath[];
        totalCases: number;
      }>(`/smoke/generate`, { projectId, environmentId }),
    onError: (error) => {
      toast.error(`生成冒烟测试失败: ${error instanceof Error ? error.message : '未知错误'}`);
    },
  });
}

export function useSmokeExecute() {
  return useMutation({
    mutationFn: (taskId: string) =>
      api.post<{ batchRunId: string }>(`/smoke/execute`, { taskId }),
    onError: (error) => {
      toast.error(`执行冒烟测试失败: ${error instanceof Error ? error.message : '未知错误'}`);
    },
  });
}

export function useSmokeStatus(taskId: string | undefined) {
  return useQuery<SmokeTaskStatus>({
    queryKey: ["smoke", "status", taskId],
    queryFn: () => api.get(`/smoke/status?taskId=${taskId}`),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") return false;
      return 1000; // Poll every second while running
    },
  });
}
