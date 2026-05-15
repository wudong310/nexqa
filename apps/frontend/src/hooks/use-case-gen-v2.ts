/**
 * use-case-gen-v2 — API 端点用例生成 Hooks
 *
 * 对标 use-plan-gen.ts，实现：
 * - useStartCaseGen() — useMutation，POST触发生成
 * - useCaseGenTask(taskId) — useQuery，轮询任务状态（generating时每2秒）
 * - useCaseGenTasks(projectId) — useQuery，任务列表
 * - useAdoptCases() — useMutation，POST采纳
 */

import { api } from "@/lib/api";
import type {
  AdoptCaseGenRequest,
  AdoptCaseGenResponse,
  CaseGenTask,
  StartCaseGenRequest,
  StartCaseGenResponse,
} from "@/types/case-gen-v2";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// ── Query Keys ──────────────────────────────────────

export const caseGenV2Keys = {
  all: (projectId: string) => ["case-gen-v2", projectId] as const,
  task: (taskId: string | null) => ["case-gen-v2", "task", taskId] as const,
  tasks: (projectId: string) => ["case-gen-v2", "tasks", projectId] as const,
};

// ── Start Case Gen — POST /projects/:projectId/case-gen-v2 ───

export function useStartCaseGen(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: StartCaseGenRequest) =>
      api.post<StartCaseGenResponse>(
        `/projects/${projectId}/case-gen-v2`,
        req
      ),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: caseGenV2Keys.tasks(projectId) });
      toast.success("用例生成已触发");
    },
    onError: (err: Error) => {
      toast.error(`生成失败：${err.message}`);
    },
  });
}

// ── Get Task — GET /case-gen-tasks/:id ──────────────

export function useCaseGenTask(taskId: string | null) {
  return useQuery<CaseGenTask>({
    queryKey: caseGenV2Keys.task(taskId),
    queryFn: () => api.get<CaseGenTask>(`/case-gen-tasks/${taskId}`),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const task = query.state.data;
      // generating 时每 2 秒轮询
      if (task && task.status === "generating") {
        return 2000;
      }
      // pending 时每 3 秒轮询
      if (task && task.status === "pending") {
        return 3000;
      }
      // completed/failed 时停止轮询
      return false;
    },
  });
}

// ── Get Tasks — GET /projects/:projectId/case-gen-v2/tasks ──

export function useCaseGenTasks(projectId: string) {
  return useQuery<{ records: CaseGenTask[] }>({
    queryKey: caseGenV2Keys.tasks(projectId),
    queryFn: () =>
      api.get<{ records: CaseGenTask[] }>(
        `/projects/${projectId}/case-gen-v2/tasks`
      ),
    enabled: !!projectId,
  });
}

// ── Adopt Cases — POST /case-gen-tasks/:id/adopt ─────

export function useAdoptCases(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: AdoptCaseGenRequest) =>
      api.post<AdoptCaseGenResponse>(`/case-gen-tasks/${taskId}/adopt`, req),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["test-cases"] });
      toast.success(`已采纳 ${data.adoptedCount} 条用例`);
    },
    onError: (err: Error) => {
      toast.error(`采纳失败：${err.message}`);
    },
  });
}