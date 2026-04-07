import { api } from "@/lib/api";
import type { CoverageData, TrendData, Granularity, TimeRange } from "@/types/coverage";
import { useQuery } from "@tanstack/react-query";

// ── Query Keys ──────────────────────────────────────

export const coverageKeys = {
  all: (projectId: string) => ["coverage", projectId] as const,
  trends: (projectId: string, granularity: Granularity, range: TimeRange) =>
    ["trends", projectId, granularity, range] as const,
};

// ── Queries ─────────────────────────────────────────

export function useCoverage(projectId: string) {
  return useQuery<CoverageData>({
    queryKey: coverageKeys.all(projectId),
    queryFn: () => api.get(`/coverage?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export function useTrends(
  projectId: string,
  granularity: Granularity,
  range: TimeRange,
) {
  return useQuery<TrendData>({
    queryKey: coverageKeys.trends(projectId, granularity, range),
    queryFn: () =>
      api.get(
        `/trends?projectId=${projectId}&period=${granularity}&range=${range === "custom" ? "30" : range.replace("d", "")}`,
      ),
    enabled: !!projectId,
  });
}
