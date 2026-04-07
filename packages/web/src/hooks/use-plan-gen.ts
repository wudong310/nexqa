import { api } from "@/lib/api";
import type {
  PlanGenAdoptRequest,
  PlanGenAdoptResponse,
  PlanGenGenerateRequest,
  PlanGenGenerateResponse,
  PlanGenTemplatesResponse,
} from "@/types/plan-gen";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { testPlanKeys } from "./use-test-plans";

// ── Query Keys ──────────────────────────────────────

export const planGenKeys = {
  templates: (projectId: string) => ["plan-gen", "templates", projectId] as const,
};

// ── Generate — POST /plan-gen/generate ──────────────

export function usePlanGenGenerate(projectId: string) {
  return useMutation({
    mutationFn: (req: PlanGenGenerateRequest) =>
      api.post<PlanGenGenerateResponse>(
        '/projects/plan-gen/generate',
        { projectId, ...req },
      ),
    onError: (err: Error) =>
      toast.error(`方案生成失败：${err.message}`),
  });
}

// ── Templates — GET /plan-gen/templates ─────────────

export function usePlanGenTemplates(projectId: string) {
  return useQuery<PlanGenTemplatesResponse>({
    queryKey: planGenKeys.templates(projectId),
    queryFn: () => api.get(`/projects/plan-gen/templates?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

// ── Adopt — POST /plan-gen/adopt ────────────────────

export function usePlanGenAdopt(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: PlanGenAdoptRequest) =>
      api.post<PlanGenAdoptResponse>(
        '/projects/plan-gen/adopt',
        { projectId, ...req },
      ),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: testPlanKeys.all(projectId) });
      toast.success(`方案「${data.name}」已创建`);
    },
    onError: (err: Error) =>
      toast.error(`采纳失败：${err.message}`),
  });
}
