/**
 * ci-types.ts — CI/CD 集成类型定义
 *
 * 数据模型：
 * - CIConfig：项目级 CI 配置（Webhook Secret、触发规则、通知）
 * - TriggerRule：触发规则（分支/文件路径匹配）
 * - CIExecution：CI 执行记录
 * - WebhookConfig：Webhook 接收 + 通知配置
 * - OutgoingWebhook：通知 Webhook
 */

// ── CI 配置 ──────────────────────────────────────

export interface CIConfig {
  projectId: string;
  enabled: boolean;
  webhookSecret: string;
  triggers: TriggerRule[];
  notifyUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TriggerRule {
  id: string;
  name: string;
  enabled: boolean;

  /** 触发条件 */
  trigger: {
    type: "api-change" | "schedule" | "webhook" | "manual";
    config: {
      /** 分支匹配模式（glob） */
      branch?: string;
      /** 文件路径匹配模式（glob） */
      pathPattern?: string;
      /** schedule 类型的 cron 表达式 */
      cron?: string;
      /** webhook 类型的事件过滤 */
      webhookFilter?: string;
    };
  };

  /** 执行动作 */
  action: {
    type: "smoke" | "regression" | "full" | "security" | "custom-plan";
    planId?: string;
    environmentId?: string;
    environmentSlug?: string;
  };

  /** 通知 */
  notification: {
    webhookIds: string[];
    condition: "always" | "failure-only" | "none";
  };

  lastTriggered?: string;
  lastResult?: "pass" | "fail" | "error";
}

// ── Webhook 配置 ─────────────────────────────────

export interface WebhookConfig {
  id: string;
  projectId: string;

  /** 接收配置 */
  incoming: {
    token: string;
    tokenCreatedAt: string;
    enabled: boolean;
  };

  /** 通知配置列表 */
  outgoing: OutgoingWebhook[];
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

// ── CI 执行记录 ──────────────────────────────────

export interface CIExecution {
  id: string;
  projectId: string;
  number: number;
  name: string;
  triggerType: "api-change" | "schedule" | "webhook" | "manual";
  triggerDetail: string;
  environmentSlug: string;
  ruleId?: string;
  batchRunId?: string;
  result: "pass" | "fail" | "error" | "running";
  passed: number;
  total: number;
  durationMs: number;
  triggeredAt: string;
  completedAt?: string;
  aiAnalysisSummary?: string;
}

// ── GitHub/GitLab Webhook Payloads ────────────────

export interface GitHubPushPayload {
  ref: string;
  before: string;
  after: string;
  repository: {
    full_name: string;
    html_url: string;
  };
  pusher: {
    name: string;
    email?: string;
  };
  commits: Array<{
    id: string;
    message: string;
    added: string[];
    removed: string[];
    modified: string[];
  }>;
  head_commit?: {
    id: string;
    message: string;
  };
}

export interface GitHubPRPayload {
  action: string;
  number: number;
  pull_request: {
    head: {
      sha: string;
      ref: string;
    };
    base: {
      ref: string;
    };
    title: string;
  };
  repository: {
    full_name: string;
  };
}

export interface GitLabPushPayload {
  ref: string;
  before: string;
  after: string;
  project: {
    path_with_namespace: string;
    web_url: string;
  };
  user_name: string;
  commits: Array<{
    id: string;
    message: string;
    added: string[];
    removed: string[];
    modified: string[];
  }>;
}

// ── Webhook 触发请求 ──────────────────────────────

export interface WebhookTriggerRequest {
  type: "smoke" | "regression" | "security" | "full";
  env?: string;
  specContent?: string;
  meta?: {
    commit?: string;
    branch?: string;
    triggeredBy?: string;
    prNumber?: number;
    repoFullName?: string;
  };
}

// ── 通知 payload ─────────────────────────────────

export interface NotificationPayload {
  event: string;
  execution: {
    id: string;
    name: string;
    result: string;
    passed: number;
    total: number;
    durationMs: number;
    triggeredAt: string;
    completedAt?: string;
  };
  project: {
    id: string;
    name?: string;
  };
}
