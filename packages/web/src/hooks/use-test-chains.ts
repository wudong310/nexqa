import { api } from "@/lib/api";
import type {
  CreateTestChain,
  TestChain,
  UpdateTestChain,
} from "@nexqa/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// ── Query Keys ──────────────────────────────────────

export const testChainKeys = {
  all: (projectId: string) => ["test-chains", projectId] as const,
  detail: (chainId: string) => ["test-chain", chainId] as const,
};

// ── Queries ─────────────────────────────────────────

export function useTestChains(projectId: string) {
  return useQuery<TestChain[]>({
    queryKey: testChainKeys.all(projectId),
    queryFn: () => api.get(`/test-chains?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export function useTestChain(chainId: string | null) {
  return useQuery<TestChain>({
    queryKey: testChainKeys.detail(chainId ?? ""),
    queryFn: () => api.get(`/test-chains/detail?id=${chainId}`),
    enabled: !!chainId,
  });
}

// ── Mutations ───────────────────────────────────────

export function useCreateTestChain(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTestChain) =>
      api.post<TestChain>("/test-chains", { ...data, projectId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: testChainKeys.all(projectId) });
      toast.success("测试链已创建");
    },
    onError: (err: Error) => toast.error(`创建失败：${err.message}`),
  });
}

export function useUpdateTestChain(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTestChain }) =>
      api.post<TestChain>('/test-chains/update', { id, ...data }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: testChainKeys.all(projectId) });
      qc.invalidateQueries({ queryKey: testChainKeys.detail(vars.id) });
      toast.success("测试链已更新");
    },
    onError: (err: Error) => toast.error(`更新失败：${err.message}`),
  });
}

export function useDeleteTestChain(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (chainId: string) => api.post('/test-chains/delete', { id: chainId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: testChainKeys.all(projectId) });
      toast.success("测试链已删除");
    },
    onError: (err: Error) => toast.error(`删除失败：${err.message}`),
  });
}

export interface ChainExecutionResult {
  batchRunId: string;
  steps: {
    stepId: string;
    caseId: string;
    passed: boolean;
    extractedVars: Record<string, unknown>;
    duration: number;
    failReason?: string;
  }[];
}

export function useExecuteTestChain() {
  return useMutation({
    mutationFn: ({
      chainId,
      environmentId,
    }: {
      chainId: string;
      environmentId?: string | null;
    }) =>
      api.post<ChainExecutionResult>('/test-chains/run', {
        id: chainId,
        environmentId: environmentId ?? null,
      }),
    onSuccess: () => {
      toast.success("测试链执行完成");
    },
    onError: (err: Error) => toast.error(`执行失败：${err.message}`),
  });
}
