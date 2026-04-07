import {
  isFilterActive,
  matchesTagFilter,
  type TagFilter,
} from "@/components/tag-filter-bar";
import { safeTags } from "@/components/tag-editor";
import { api } from "@/lib/api";
import { getModuleName } from "@/utils/api-test-helpers";
import { runBatch } from "@/utils/batch-runner";
import { doStreamGenerate } from "@/utils/stream-generate";
import type {
  ApiEndpoint,
  Project,
  TestCase,
  TestResult,
} from "@nexqa/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";

interface UseApiTestDataOptions {
  projectId: string;
  tagFilter: TagFilter;
  searchQuery: string;
  /** Callbacks into page-level UI state */
  onCaseDeleted?: () => void;
  onEndpointDeleted?: () => void;
  onEndpointUpdated?: () => void;
  onExecResult?: (result: TestResult) => void;
}

export function useApiTestData({
  projectId,
  tagFilter,
  searchQuery,
  onCaseDeleted,
  onEndpointDeleted,
  onEndpointUpdated,
  onExecResult,
}: UseApiTestDataOptions) {
  const queryClient = useQueryClient();

  // ── Queries ──
  const { data: project } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: () => api.get(`/projects/detail?id=${projectId}`),
  });

  const { data: endpoints = [] } = useQuery<ApiEndpoint[]>({
    queryKey: ["api-endpoints", projectId],
    queryFn: () => api.get(`/api-endpoints?projectId=${projectId}`),
  });

  const { data: results = [] } = useQuery<TestResult[]>({
    queryKey: ["test-results", projectId],
    queryFn: () => api.get(`/test-results?projectId=${projectId}`),
  });

  const { data: allCases = [] } = useQuery<TestCase[]>({
    queryKey: ["test-cases", projectId],
    queryFn: () => api.get(`/test-cases?projectId=${projectId}`),
  });

  // ── Derived state ──
  const filteredCases = useMemo(() => {
    if (!isFilterActive(tagFilter)) return allCases;
    return allCases.filter((tc) => matchesTagFilter(safeTags(tc.tags), tagFilter));
  }, [allCases, tagFilter]);

  const moduleGroups = useMemo(() => {
    const casesByEp = new Map<string, TestCase[]>();
    for (const tc of filteredCases) {
      const list = casesByEp.get(tc.endpointId) || [];
      list.push(tc);
      casesByEp.set(tc.endpointId, list);
    }

    const modules = new Map<
      string,
      { endpoint: ApiEndpoint; cases: TestCase[] }[]
    >();
    for (const ep of endpoints) {
      const mod = getModuleName(ep.path);
      const cases = casesByEp.get(ep.id) || [];
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          ep.path.toLowerCase().includes(q) ||
          ep.method.toLowerCase().includes(q) ||
          (ep.summary || "").toLowerCase().includes(q);
        if (!match) continue;
      }
      if (!modules.has(mod)) modules.set(mod, []);
      modules.get(mod)!.push({ endpoint: ep, cases });
    }
    return modules;
  }, [endpoints, filteredCases, searchQuery]);

  const visibleStats = useMemo(() => {
    let epCount = 0;
    let caseCount = 0;
    for (const entries of moduleGroups.values()) {
      epCount += entries.length;
      for (const e of entries) caseCount += e.cases.length;
    }
    return { epCount, caseCount };
  }, [moduleGroups]);

  const smokeCases = useMemo(() => {
    return allCases.filter((tc) => {
      const t = safeTags(tc.tags);
      if (!t) return false;
      const isSmoke = Array.isArray(t.phase) && t.phase.includes("smoke");
      const isP0 = t.priority === "P0";
      return isSmoke || isP0;
    });
  }, [allCases]);

  const filterActive = isFilterActive(tagFilter);

  // ── Helper ──
  function getLatestResult(caseId: string): TestResult | null {
    const found = results
      .filter((r) => r.caseId === caseId)
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
    return found[0] || null;
  }

  // ── Invalidation helpers ──
  const invalidateCases = () =>
    queryClient.invalidateQueries({ queryKey: ["test-cases", projectId] });

  // ── Mutations ──
  const generateMutation = useMutation({
    mutationFn: async ({
      ep,
      tags,
    }: { ep: ApiEndpoint; tags?: string[] }) => {
      const generated = await doStreamGenerate([ep], tags);
      for (const tc of generated) {
        await api.post("/test-cases", { endpointId: ep.id, ...tc });
      }
      return generated;
    },
    onSuccess: (generated) => {
      invalidateCases();
      toast.success(`已生成 ${generated.length} 条用例`);
    },
    onError: (err: Error) => {
      toast.error(`生成失败：${err.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) =>
      api.post('/test-cases/update', { id, ...data as object }),
    onSuccess: () => {
      invalidateCases();
      toast.success("用例已更新");
    },
    onError: (err: Error) => {
      toast.error(`更新失败：${err.message}`);
    },
  });

  const deleteCaseMutation = useMutation({
    mutationFn: (id: string) => api.post('/test-cases/delete', { id }),
    onSuccess: () => {
      invalidateCases();
      onCaseDeleted?.();
      toast.success("用例已删除");
    },
    onError: (err: Error) => {
      toast.error(`删除失败：${err.message}`);
    },
  });

  const updateEndpointMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) =>
      api.post<ApiEndpoint>('/api-endpoints/update', { id, ...data as object }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["api-endpoints", projectId],
      });
      onEndpointUpdated?.();
      toast.success("接口已更新");
    },
    onError: (err: Error) => {
      toast.error(`更新失败：${err.message}`);
    },
  });

  const deleteEndpointMutation = useMutation({
    mutationFn: (id: string) => api.post('/api-endpoints/delete', { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["api-endpoints", projectId],
      });
      invalidateCases();
      onEndpointDeleted?.();
      toast.success("接口已删除");
    },
    onError: (err: Error) => {
      toast.error(`删除失败：${err.message}`);
    },
  });

  const execMutation = useMutation({
    mutationFn: (tc: TestCase) =>
      api.post<TestResult>("/test/exec", { testCase: tc, projectId }),
    onSuccess: (result) => {
      onExecResult?.(result);
      queryClient.invalidateQueries({ queryKey: ["test-results", projectId] });
    },
    onError: (err: Error) => {
      toast.error(`执行失败：${err.message}`);
    },
  });

  // ── Batch handlers ──
  async function handleGenerateSelected(checkedEpIds: Set<string>) {
    const targets =
      checkedEpIds.size > 0
        ? endpoints.filter((ep) => checkedEpIds.has(ep.id))
        : endpoints;
    for (const ep of targets) {
      await generateMutation.mutateAsync({ ep });
    }
  }

  async function handleDeleteChecked(checkedEpIds: Set<string>) {
    for (const epId of checkedEpIds) {
      await deleteEndpointMutation.mutateAsync(epId);
    }
  }

  async function handleExecuteChecked(
    checkedEpIds: Set<string>,
    onProgress: (done: number, total: number) => void,
  ): Promise<{ passed: number; failed: number }> {
    const epIds =
      checkedEpIds.size > 0
        ? checkedEpIds
        : new Set(endpoints.map((ep) => ep.id));
    const targets = filteredCases.filter((tc) => epIds.has(tc.endpointId));
    const result = await runBatch(targets, (tc) => execMutation.mutateAsync(tc), onProgress);
    queryClient.invalidateQueries({ queryKey: ["test-results", projectId] });
    return result;
  }

  async function handleQuickSmoke(
    onProgress: (done: number, total: number) => void,
  ): Promise<{ passed: number; failed: number }> {
    const result = await runBatch(smokeCases, (tc) => execMutation.mutateAsync(tc), onProgress);
    queryClient.invalidateQueries({ queryKey: ["test-results", projectId] });
    return result;
  }

  return {
    // Data
    project,
    endpoints,
    allCases,
    filteredCases,
    moduleGroups,
    visibleStats,
    smokeCases,
    filterActive,
    // Helpers
    getLatestResult,
    // Mutations
    generateMutation,
    updateMutation,
    deleteCaseMutation,
    updateEndpointMutation,
    deleteEndpointMutation,
    execMutation,
    // Batch handlers
    handleGenerateSelected,
    handleDeleteChecked,
    handleExecuteChecked,
    handleQuickSmoke,
  };
}
