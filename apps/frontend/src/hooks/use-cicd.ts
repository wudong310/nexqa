import { api } from "@/lib/api";
import type {
  CICDExecution,
  OutgoingWebhook,
  TriggerRule,
  WebhookConfig,
} from "@/types/cicd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// ── Webhook Config ──────────────────────────────────────

export function useWebhookConfig(projectId: string) {
  return useQuery<WebhookConfig>({
    queryKey: ["webhook-config", projectId],
    queryFn: () =>
      api.get<WebhookConfig>(`/projects/webhook-config?projectId=${projectId}`),
  });
}

export function useRegenerateToken(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ token: string }>(
        '/projects/webhook-config/regenerate-token',
        { projectId },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["webhook-config", projectId],
      });
    },
    onError: (error) => {
      toast.error(`重新生成 Token 失败: ${error instanceof Error ? error.message : '未知错误'}`);
    },
  });
}

export function useAddOutgoingWebhook(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<OutgoingWebhook, "id" | "lastTriggered" | "lastStatus">) =>
      api.post<OutgoingWebhook>(
        '/projects/outgoing-webhooks',
        { projectId, ...data },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["webhook-config", projectId],
      });
    },
    onError: (error) => {
      toast.error(`添加 Webhook 失败: ${error instanceof Error ? error.message : '未知错误'}`);
    },
  });
}

export function useDeleteOutgoingWebhook(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (webhookId: string) =>
      api.post('/projects/outgoing-webhooks/delete', { projectId, id: webhookId }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["webhook-config", projectId],
      });
    },
    onError: (error) => {
      toast.error(`删除 Webhook 失败: ${error instanceof Error ? error.message : '未知错误'}`);
    },
  });
}

export function useTestWebhook(projectId: string) {
  return useMutation({
    mutationFn: (webhookId: string) =>
      api.post<{ success: boolean }>(
        '/projects/outgoing-webhooks/test',
        { projectId, id: webhookId },
      ),
    onError: (error) => {
      toast.error(`测试 Webhook 失败: ${error instanceof Error ? error.message : '未知错误'}`);
    },
  });
}

// ── Trigger Rules ───────────────────────────────────────

export function useTriggerRules(projectId: string) {
  return useQuery<TriggerRule[]>({
    queryKey: ["trigger-rules", projectId],
    queryFn: () =>
      api.get<TriggerRule[]>(`/projects/trigger-rules?projectId=${projectId}`),
  });
}

export function useCreateTriggerRule(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<TriggerRule, "id" | "projectId" | "lastTriggered" | "lastResult">) =>
      api.post<TriggerRule>('/projects/trigger-rules', { projectId, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["trigger-rules", projectId],
      });
    },
    onError: (error) => {
      toast.error(`创建触发规则失败: ${error instanceof Error ? error.message : '未知错误'}`);
    },
  });
}

export function useToggleTriggerRule(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; enabled: boolean }) =>
      api.post('/projects/trigger-rules/toggle', {
        projectId,
        id: data.id,
        enabled: data.enabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["trigger-rules", projectId],
      });
    },
    onError: (error) => {
      toast.error(`切换触发规则失败: ${error instanceof Error ? error.message : '未知错误'}`);
    },
  });
}

export function useDeleteTriggerRule(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) =>
      api.post('/projects/trigger-rules/delete', { projectId, id: ruleId }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["trigger-rules", projectId],
      });
    },
    onError: (error) => {
      toast.error(`删除触发规则失败: ${error instanceof Error ? error.message : '未知错误'}`);
    },
  });
}

// ── CI/CD Executions ────────────────────────────────────

export function useCICDExecutions(
  projectId: string,
  filters?: {
    triggerType?: string;
    result?: string;
    timeRange?: string;
  },
) {
  const params = new URLSearchParams();
  if (filters?.triggerType && filters.triggerType !== "all")
    params.set("triggerType", filters.triggerType);
  if (filters?.result && filters.result !== "all")
    params.set("result", filters.result);
  if (filters?.timeRange) params.set("timeRange", filters.timeRange);
  const query = params.toString();

  return useQuery<CICDExecution[]>({
    queryKey: ["cicd-executions", projectId, filters],
    queryFn: () =>
      api.get<CICDExecution[]>(
        `/projects/cicd-executions?projectId=${projectId}${query ? `&${query}` : ""}`,
      ),
  });
}
