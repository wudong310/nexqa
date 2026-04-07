import { api } from "@/lib/api";
import type { TrendAnalysisResult, QualityRisk } from "@/types/trend-analysis";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useTrendAnalysis(projectId: string) {
  return useMutation({
    mutationFn: (data: { timeRange: string; force?: boolean }) =>
      api.post<TrendAnalysisResult>(
        '/projects/trend-analysis',
        { projectId, ...data },
      ),
    onError: (error) => {
      toast.error(`趋势分析失败: ${error instanceof Error ? error.message : '未知错误'}`);
    },
  });
}

export function useTrendInsights(projectId: string, enabled = true) {
  return useQuery<TrendAnalysisResult["insights"]>({
    queryKey: ["trend-insights", projectId],
    queryFn: () =>
      api.get<TrendAnalysisResult["insights"]>(
        `/projects/trend-insights?projectId=${projectId}`,
      ),
    enabled,
  });
}

export function useQualityRisks(projectId: string, enabled = true) {
  return useQuery<QualityRisk[]>({
    queryKey: ["quality-risks", projectId],
    queryFn: () =>
      api.get<QualityRisk[]>(`/projects/quality-risks?projectId=${projectId}`),
    enabled,
  });
}

export function useDismissRisk(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (riskId: string) =>
      api.post('/projects/quality-risks/dismiss', { projectId, riskId }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["quality-risks", projectId],
      });
    },
    onError: (error) => {
      toast.error(`忽略风险失败: ${error instanceof Error ? error.message : '未知错误'}`);
    },
  });
}
