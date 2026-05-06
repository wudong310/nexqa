import { api } from "@/lib/api";
import type { HealthStatus } from "@/types/cicd";
import type { Environment } from "@nexqa/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

// ── Health check ────────────────────────────────────────

interface HealthResponse {
  healthy: boolean;
  latencyMs: number | null;
  error?: string;
  checkedAt: string;
}

export function useEnvironmentHealth() {
  const [healthMap, setHealthMap] = useState<Record<string, HealthStatus>>({});

  const checkSingle = useCallback(async (envId: string) => {
    setHealthMap((prev) => ({
      ...prev,
      [envId]: { state: "checking" },
    }));
    try {
      const res = await api.get<HealthResponse>(
        `/environments/health?id=${envId}`,
      );
      const state: HealthStatus["state"] = res.healthy
        ? res.latencyMs && res.latencyMs > 2000
          ? "slow"
          : "healthy"
        : "unhealthy";
      setHealthMap((prev) => ({
        ...prev,
        [envId]: {
          state,
          latencyMs: res.latencyMs ?? undefined,
          error: res.error,
          checkedAt: res.checkedAt,
        },
      }));
    } catch {
      setHealthMap((prev) => ({
        ...prev,
        [envId]: {
          state: "unhealthy",
          error: "请求失败",
          checkedAt: new Date().toISOString(),
        },
      }));
    }
  }, []);

  const checkAll = useCallback(
    async (environments: Environment[]) => {
      const concurrency = 3;
      const queue = [...environments];
      const workers = Array.from({ length: concurrency }, async () => {
        while (queue.length > 0) {
          const env = queue.shift();
          if (env) await checkSingle(env.id);
        }
      });
      await Promise.all(workers);
    },
    [checkSingle],
  );

  return { healthMap, checkSingle, checkAll };
}

// ── Environment reorder ─────────────────────────────────

export function useEnvironmentReorder(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orders: { id: string; order: number }[]) =>
      api.post('/projects/environments/reorder', { projectId, orders }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["environments", projectId],
      });
    },
    onError: (error) => {
      toast.error(`环境排序失败: ${error instanceof Error ? error.message : '未知错误'}`);
    },
  });
}
