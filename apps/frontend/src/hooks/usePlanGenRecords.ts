/**
 * usePlanGenRecords — 生成记录管理 hooks
 *
 * - usePlanGenRecords: 查询项目生成记录列表（5秒自动刷新）
 * - useAdoptPlanGen: 采纳生成结果
 * - useDiscardPlanGen: 丢弃生成记录
 */

import { api } from "@/lib/api";
import type {
  AdoptPlanGenRequest,
  AdoptPlanGenResponse,
  PlanGenRecord,
  PlanGenRecordsResponse,
} from "@/types/plan-gen-v2";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// ── Query Keys ──────────────────────────────────────

export const planGenRecordKeys = {
  all: (projectId: string) => ["plan-gen-records", projectId] as const,
};

// ── Queries ─────────────────────────────────────────

export function usePlanGenRecords(projectId: string) {
  return useQuery<PlanGenRecord[]>({
    queryKey: planGenRecordKeys.all(projectId),
    queryFn: async () => {
      const res = await api.get<PlanGenRecordsResponse>(
        `/projects/${projectId}/plan-gen-v2/records`
      );
      return res.records;
    },
    enabled: !!projectId,
    refetchInterval: 5000, // 每 5 秒刷新一次
  });
}

// ── Detail Query ───────────────────────────────────

export function usePlanGenRecordDetail(generationId: string | null) {
  return useQuery<PlanGenRecord & { logs?: LogEntry[] }>({
    queryKey: ["plan-gen-record-detail", generationId],
    queryFn: () => api.get(`/plan-generations-v2/${generationId}`),
    enabled: !!generationId,
    refetchInterval: (query) => {
      // generating 状态时 3s 轮询，其他状态不轮询
      const status = query.state.data?.status;
      return status === "generating" ? 3000 : false;
    },
  });
}

/** 日志条目类型 */
export interface LogEntry {
  event: "delta" | "tool_use" | "tool_result" | "error" | "final";
  text: string;
  timestamp: string;
}

// ── Mutations ───────────────────────────────────────

export function useAdoptPlanGen(projectId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (req: AdoptPlanGenRequest) =>
      api.post<AdoptPlanGenResponse>(
        `/plan-generations-v2/${req.generationId}/adopt`,
        { name: req.name, description: req.description }
      ),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: planGenRecordKeys.all(projectId) });
      qc.invalidateQueries({ queryKey: ["test-plans", projectId] });
      toast.success(`方案「${data.plan.name}」已采纳`);
    },
    onError: (err: Error) => {
      toast.error(`采纳失败：${err.message}`);
    },
  });
}

export function useDiscardPlanGen(projectId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (generationId: string) =>
      api.delete<{ ok: boolean }>(`/plan-generations-v2/${generationId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: planGenRecordKeys.all(projectId) });
      toast.success("已丢弃生成记录");
    },
    onError: (err: Error) => {
      toast.error(`丢弃失败：${err.message}`);
    },
  });
}
