// ── CI/CD Types ─────────────────────────────────────────

export interface WebhookIncoming {
  token: string;
  tokenCreatedAt: string;
  enabled: boolean;
}

export interface OutgoingWebhook {
  id: string;
  name: string;
  url: string;
  events: ("completed" | "failed" | "smoke-passed" | "regression-done")[];
  notifyOn: "always" | "failure-only";
  active: boolean;
  lastTriggered?: string;
  lastStatus?: "success" | "error";
}

export interface WebhookConfig {
  id: string;
  projectId: string;
  incoming: WebhookIncoming;
  outgoing: OutgoingWebhook[];
}

export interface TriggerRuleConfig {
  cron?: string;
  webhookFilter?: string;
}

export interface TriggerRuleAction {
  type: "smoke" | "regression" | "full" | "security" | "custom-plan";
  planId?: string;
  environmentId?: string;
  environmentSlug?: string;
}

export interface TriggerRuleNotification {
  webhookIds: string[];
  condition: "always" | "failure-only" | "none";
}

export interface TriggerRule {
  id: string;
  projectId: string;
  name: string;
  enabled: boolean;
  trigger: {
    type: "api-change" | "schedule" | "webhook" | "manual";
    config: TriggerRuleConfig;
  };
  action: TriggerRuleAction;
  notification: TriggerRuleNotification;
  lastTriggered?: string;
  lastResult?: "pass" | "fail" | "error";
}

export interface CICDExecution {
  id: string;
  projectId: string;
  number: number;
  name: string;
  triggerType: "api-change" | "schedule" | "webhook" | "manual";
  triggerDetail: string;
  environmentSlug: string;
  ruleId?: string;
  batchRunId: string;
  result: "pass" | "fail" | "error" | "running";
  passed: number;
  total: number;
  durationMs: number;
  triggeredAt: string;
  completedAt?: string;
  aiAnalysisSummary?: string;
}

export interface HealthStatus {
  state: "idle" | "checking" | "healthy" | "unhealthy" | "slow";
  latencyMs?: number;
  error?: string;
  checkedAt?: string;
}
