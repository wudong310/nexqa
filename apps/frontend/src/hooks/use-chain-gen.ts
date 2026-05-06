import { api } from "@/lib/api";
import type {
  ChainGenAdoptRequest,
  ChainGenAdoptResponse,
  ChainGenAnalyzeRequest,
  ChainGenAnalyzeResponse,
  ChainGenStatusResponse,
} from "@/types/chain-gen";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { testChainKeys } from "./use-test-chains";

// ── Query Keys ──────────────────────────────────────

export const chainGenKeys = {
  status: (taskId: string) => ["chain-gen", "status", taskId] as const,
};

// ── Analyze — POST /chain-gen/analyze ───────────────

export function useChainGenAnalyze(projectId: string) {
  return useMutation({
    mutationFn: (req: ChainGenAnalyzeRequest) =>
      api.post<ChainGenAnalyzeResponse>(
        '/projects/chain-gen/analyze',
        { projectId, ...req },
      ),
    onError: (err: Error) =>
      toast.error(`分析失败：${err.message}`),
  });
}

// ── Generate — POST /chain-gen/generate ─────────────

export function useChainGenGenerate(projectId: string) {
  return useMutation({
    mutationFn: (taskId: string) =>
      api.post<ChainGenAnalyzeResponse>(
        '/projects/chain-gen/generate',
        { projectId, taskId },
      ),
    onError: (err: Error) =>
      toast.error(`生成失败：${err.message}`),
  });
}

// ── Status — GET /chain-gen/status/:taskId (auto-polling) ──

export function useChainGenStatus(taskId: string | undefined) {
  return useQuery<ChainGenStatusResponse>({
    queryKey: chainGenKeys.status(taskId ?? ""),
    queryFn: () => api.get(`/chain-gen/status?taskId=${taskId}`),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "completed" || status === "failed") return false;
      return 1500;
    },
  });
}

// ── Adopt — POST /chain-gen/adopt ───────────────────

export function useChainGenAdopt(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: ChainGenAdoptRequest) =>
      api.post<ChainGenAdoptResponse>(
        '/projects/chain-gen/adopt',
        { projectId, ...req },
      ),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: testChainKeys.all(projectId) });
      toast.success(`已创建 ${data.adopted.length} 条测试链`);
    },
    onError: (err: Error) =>
      toast.error(`采纳失败：${err.message}`),
  });
}
