import { api } from "@/lib/api";
import type {
  ApiDiff,
  AutoRegressionResult,
  ImpactAnalysis,
} from "@/types/regression";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

export function useApiDiff(projectId: string) {
  return useMutation({
    mutationFn: (data: {
      specContent: string;
      version?: string;
      source?: string;
    }) => api.post<ApiDiff>('/projects/api-diff', { projectId, ...data }),
    onError: (error) => {
      toast.error(`API Diff 分析失败: ${error instanceof Error ? error.message : '未知错误'}`);
    },
  });
}

export function useImpactAnalysis(projectId: string, diffId?: string) {
  return useQuery<ImpactAnalysis>({
    queryKey: ["impact-analysis", projectId, diffId],
    queryFn: () =>
      api.get<ImpactAnalysis>(
        `/projects/api-diff/impact?projectId=${projectId}&diffId=${diffId}`,
      ),
    enabled: !!diffId,
  });
}

export function useGenerateRegression(projectId: string) {
  return useMutation({
    mutationFn: (data: {
      diffId: string;
      environmentId?: string;
      autoAdjust?: boolean;
    }) =>
      api.post<{ regressionId: string }>(
        '/projects/api-diff/generate-regression',
        { projectId, ...data },
      ),
    onError: (error) => {
      toast.error(`生成回归计划失败: ${error instanceof Error ? error.message : '未知错误'}`);
    },
  });
}

export function useRegressionPlan(projectId: string, regressionId?: string) {
  return useQuery<AutoRegressionResult>({
    queryKey: ["regression-plan", projectId, regressionId],
    queryFn: () =>
      api.get<AutoRegressionResult>(
        `/projects/regression/detail?projectId=${projectId}&regressionId=${regressionId}`,
      ),
    enabled: !!regressionId,
  });
}

export function useExecuteRegression(projectId: string) {
  return useMutation({
    mutationFn: (data: {
      regressionId: string;
      environmentId?: string;
    }) =>
      api.post<{ batchRunId: string }>(
        '/projects/regression/execute',
        { projectId, ...data },
      ),
    onError: (error) => {
      toast.error(`执行回归测试失败: ${error instanceof Error ? error.message : '未知错误'}`);
    },
  });
}
