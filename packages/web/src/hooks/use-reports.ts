import { api } from "@/lib/api";
import type { TestReport, ExportFormat } from "@/types/coverage";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

// ── Query Keys ──────────────────────────────────────

export const reportKeys = {
  all: (projectId: string) => ["reports", projectId] as const,
  detail: (reportId: string) => ["report", reportId] as const,
};

// ── Queries ─────────────────────────────────────────

export function useReports(projectId: string) {
  return useQuery<TestReport[]>({
    queryKey: reportKeys.all(projectId),
    queryFn: () => api.get(`/reports?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export function useReport(reportId: string | null) {
  return useQuery<TestReport>({
    queryKey: reportKeys.detail(reportId ?? ""),
    queryFn: () => api.get(`/reports/detail?id=${reportId}`),
    enabled: !!reportId,
  });
}

// ── Mutations ───────────────────────────────────────

export function useExportReport() {
  return useMutation({
    mutationFn: async ({
      reportId,
      format,
    }: {
      reportId: string;
      format: ExportFormat;
    }) => {
      const res = await fetch(
        `/nexqa/api/reports/export?id=${reportId}&format=${format}`,
      );
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      return { blob, format };
    },
    onError: (error) => {
      toast.error(`导出报告失败: ${error instanceof Error ? error.message : '未知错误'}`);
    },
  });
}
