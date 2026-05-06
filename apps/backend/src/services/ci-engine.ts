/**
 * ci-engine.ts — CI/CD 核心引擎
 *
 * 功能：
 * - Webhook 签名验证（GitHub SHA-256 / GitLab Token）
 * - 触发规则匹配（分支 + 文件路径 glob）
 * - CI 执行记录管理
 * - 通知发送
 * - 文件变更提取
 */

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { v4 as uuid } from "uuid";
import { storage } from "./storage.js";
import { createLogger } from "./logger.js";
import type {
  CIConfig,
  CIExecution,
  TriggerRule,
  WebhookConfig,
  OutgoingWebhook,
  GitHubPushPayload,
  GitHubPRPayload,
  GitLabPushPayload,
  NotificationPayload,
  WebhookTriggerRequest,
} from "./ci-types.js";

const log = createLogger("ci-engine");

// ── Collections ──────────────────────────────────

const CI_CONFIG_COLLECTION = "ci-configs";
const WEBHOOK_CONFIG_COLLECTION = "webhook-configs";
const TRIGGER_RULE_COLLECTION = "trigger-rules";
const CI_EXECUTION_COLLECTION = "cicd-executions";

// ── Token generation ─────────────────────────────

export function generateWebhookToken(): string {
  return `nexqa_wh_${randomBytes(24).toString("hex")}`;
}

export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

// ── GitHub signature verification ────────────────

export function verifyGitHubSignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  try {
    const hmac = createHmac("sha256", secret);
    const digest = "sha256=" + hmac.update(body).digest("hex");
    return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ── GitLab token verification ────────────────────

export function verifyGitLabToken(
  token: string | undefined,
  secret: string,
): boolean {
  if (!token || !secret) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
  } catch {
    return false;
  }
}

// ── File change extraction ───────────────────────

/** Extract changed file list from GitHub push payload */
export function extractGitHubChangedFiles(payload: GitHubPushPayload): string[] {
  const files = new Set<string>();
  for (const commit of payload.commits) {
    for (const f of commit.added) files.add(f);
    for (const f of commit.removed) files.add(f);
    for (const f of commit.modified) files.add(f);
  }
  return Array.from(files);
}

/** Extract branch name from ref (refs/heads/main → main) */
export function extractBranchFromRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, "");
}

/** Extract changed file list from GitLab push payload */
export function extractGitLabChangedFiles(payload: GitLabPushPayload): string[] {
  const files = new Set<string>();
  for (const commit of payload.commits) {
    for (const f of commit.added) files.add(f);
    for (const f of commit.removed) files.add(f);
    for (const f of commit.modified) files.add(f);
  }
  return Array.from(files);
}

// ── Glob matching (simple implementation) ────────

/**
 * Simple glob match: supports *, **, ?
 * - * matches any characters except /
 * - ** matches any characters including /
 * - ? matches single character
 *
 * Special: **​/ at start also matches zero directories (e.g. **​/*.yaml matches openapi.yaml)
 */
export function globMatch(pattern: string, text: string): boolean {
  // Split pattern into segments by /
  const patternParts = pattern.split("/");
  const textParts = text.split("/");

  return matchParts(patternParts, 0, textParts, 0);
}

function matchParts(
  pp: string[], pi: number,
  tp: string[], ti: number,
): boolean {
  // Both exhausted → match
  if (pi === pp.length && ti === tp.length) return true;
  // Pattern exhausted but text remains → no match
  if (pi === pp.length) return false;

  // ** (globstar) segment
  if (pp[pi] === "**") {
    // Try matching ** with 0 or more text segments
    for (let skip = 0; skip <= tp.length - ti; skip++) {
      if (matchParts(pp, pi + 1, tp, ti + skip)) return true;
    }
    return false;
  }

  // Text exhausted but pattern remains → no match
  if (ti === tp.length) return false;

  // Match current segment with wildcards
  if (segmentMatch(pp[pi], tp[ti])) {
    return matchParts(pp, pi + 1, tp, ti + 1);
  }

  return false;
}

/** Match a single path segment with * and ? wildcards */
function segmentMatch(pattern: string, text: string): boolean {
  let regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");
  regex = `^${regex}$`;
  return new RegExp(regex).test(text);
}

// ── Trigger rule matching ────────────────────────

export interface MatchContext {
  branch: string;
  changedFiles: string[];
  eventType: "push" | "pull_request" | "manual" | "schedule";
}

/** Check if a trigger rule matches the given context */
export function shouldTrigger(rule: TriggerRule, ctx: MatchContext): boolean {
  if (!rule.enabled) return false;

  const { trigger } = rule;

  // Manual trigger — always match
  if (trigger.type === "manual") return ctx.eventType === "manual";

  // Schedule trigger — only match schedule events
  if (trigger.type === "schedule") return ctx.eventType === "schedule";

  // Webhook trigger — match push/PR events
  if (trigger.type === "webhook" || trigger.type === "api-change") {
    // Branch matching
    if (trigger.config.branch) {
      if (!globMatch(trigger.config.branch, ctx.branch)) {
        return false;
      }
    }

    // File path matching
    if (trigger.config.pathPattern) {
      const pattern = trigger.config.pathPattern;
      const hasMatchingFile = ctx.changedFiles.some((f) =>
        globMatch(pattern, f),
      );
      if (!hasMatchingFile) {
        return false;
      }
    }

    return true;
  }

  return false;
}

// ── CI Config management ─────────────────────────

export async function getCIConfig(projectId: string): Promise<CIConfig | null> {
  return storage.read<CIConfig>(CI_CONFIG_COLLECTION, projectId);
}

export async function upsertCIConfig(
  projectId: string,
  update: Partial<CIConfig>,
): Promise<CIConfig> {
  const existing = await getCIConfig(projectId);
  const now = new Date().toISOString();

  const config: CIConfig = {
    projectId,
    enabled: update.enabled ?? existing?.enabled ?? false,
    webhookSecret: existing?.webhookSecret ?? generateWebhookSecret(),
    triggers: update.triggers ?? existing?.triggers ?? [],
    notifyUrl: update.notifyUrl ?? existing?.notifyUrl,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await storage.write(CI_CONFIG_COLLECTION, projectId, config);
  return config;
}

// ── Webhook Config management ────────────────────

export async function getWebhookConfig(
  projectId: string,
): Promise<WebhookConfig | null> {
  return storage.read<WebhookConfig>(WEBHOOK_CONFIG_COLLECTION, projectId);
}

export async function ensureWebhookConfig(
  projectId: string,
): Promise<WebhookConfig> {
  const existing = await getWebhookConfig(projectId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const config: WebhookConfig = {
    id: uuid(),
    projectId,
    incoming: {
      token: generateWebhookToken(),
      tokenCreatedAt: now,
      enabled: true,
    },
    outgoing: [],
  };

  await storage.write(WEBHOOK_CONFIG_COLLECTION, projectId, config);
  return config;
}

export async function regenerateWebhookToken(
  projectId: string,
): Promise<WebhookConfig> {
  const config = await ensureWebhookConfig(projectId);
  config.incoming.token = generateWebhookToken();
  config.incoming.tokenCreatedAt = new Date().toISOString();
  await storage.write(WEBHOOK_CONFIG_COLLECTION, projectId, config);
  return config;
}

export async function addOutgoingWebhook(
  projectId: string,
  webhook: Omit<OutgoingWebhook, "id">,
): Promise<OutgoingWebhook> {
  const config = await ensureWebhookConfig(projectId);
  const newWebhook: OutgoingWebhook = { id: uuid(), ...webhook };
  config.outgoing.push(newWebhook);
  await storage.write(WEBHOOK_CONFIG_COLLECTION, projectId, config);
  return newWebhook;
}

export async function updateOutgoingWebhook(
  projectId: string,
  webhookId: string,
  update: Partial<OutgoingWebhook>,
): Promise<OutgoingWebhook | null> {
  const config = await ensureWebhookConfig(projectId);
  const idx = config.outgoing.findIndex((w) => w.id === webhookId);
  if (idx === -1) return null;

  config.outgoing[idx] = { ...config.outgoing[idx], ...update, id: webhookId };
  await storage.write(WEBHOOK_CONFIG_COLLECTION, projectId, config);
  return config.outgoing[idx];
}

export async function removeOutgoingWebhook(
  projectId: string,
  webhookId: string,
): Promise<boolean> {
  const config = await ensureWebhookConfig(projectId);
  const before = config.outgoing.length;
  config.outgoing = config.outgoing.filter((w) => w.id !== webhookId);
  if (config.outgoing.length === before) return false;
  await storage.write(WEBHOOK_CONFIG_COLLECTION, projectId, config);
  return true;
}

// ── Trigger Rule management ──────────────────────

export async function getTriggerRules(
  projectId: string,
): Promise<TriggerRule[]> {
  const all = await storage.list<TriggerRule & { projectId: string }>(
    TRIGGER_RULE_COLLECTION,
  );
  return all.filter((r) => r.projectId === projectId);
}

export async function createTriggerRule(
  projectId: string,
  rule: Omit<TriggerRule, "id">,
): Promise<TriggerRule & { projectId: string }> {
  const id = uuid();
  const saved = { id, projectId, ...rule } as TriggerRule & {
    projectId: string;
  };
  await storage.write(TRIGGER_RULE_COLLECTION, id, saved);
  return saved;
}

export async function updateTriggerRule(
  ruleId: string,
  update: Partial<TriggerRule>,
): Promise<TriggerRule | null> {
  const existing = await storage.read<TriggerRule & { projectId: string }>(
    TRIGGER_RULE_COLLECTION,
    ruleId,
  );
  if (!existing) return null;

  const updated = { ...existing, ...update, id: ruleId };
  await storage.write(TRIGGER_RULE_COLLECTION, ruleId, updated);
  return updated;
}

export async function deleteTriggerRule(ruleId: string): Promise<boolean> {
  return storage.remove(TRIGGER_RULE_COLLECTION, ruleId);
}

export async function toggleTriggerRule(
  ruleId: string,
): Promise<TriggerRule | null> {
  const existing = await storage.read<TriggerRule & { projectId: string }>(
    TRIGGER_RULE_COLLECTION,
    ruleId,
  );
  if (!existing) return null;

  existing.enabled = !existing.enabled;
  await storage.write(TRIGGER_RULE_COLLECTION, ruleId, existing);
  return existing;
}

// ── CI Execution management ──────────────────────

export async function getNextExecutionNumber(
  projectId: string,
): Promise<number> {
  const all = await storage.list<CIExecution>(CI_EXECUTION_COLLECTION);
  const projectExecs = all.filter((e) => e.projectId === projectId);
  if (projectExecs.length === 0) return 1;
  return Math.max(...projectExecs.map((e) => e.number)) + 1;
}

export async function createCIExecution(
  data: Omit<CIExecution, "id" | "number">,
): Promise<CIExecution> {
  const id = uuid();
  const number = await getNextExecutionNumber(data.projectId);
  const execution: CIExecution = { id, number, ...data };
  await storage.write(CI_EXECUTION_COLLECTION, id, execution);
  log.info(`Created CI execution #${number}: ${data.name}`, {
    executionId: id,
  });
  return execution;
}

export async function updateCIExecution(
  id: string,
  update: Partial<CIExecution>,
): Promise<CIExecution | null> {
  const existing = await storage.read<CIExecution>(
    CI_EXECUTION_COLLECTION,
    id,
  );
  if (!existing) return null;

  const updated = { ...existing, ...update };
  await storage.write(CI_EXECUTION_COLLECTION, id, updated);
  return updated;
}

export async function getCIExecution(
  id: string,
): Promise<CIExecution | null> {
  return storage.read<CIExecution>(CI_EXECUTION_COLLECTION, id);
}

export async function listCIExecutions(
  projectId: string,
  filters?: {
    triggerType?: string;
    result?: string;
    limit?: number;
  },
): Promise<CIExecution[]> {
  const all = await storage.list<CIExecution>(CI_EXECUTION_COLLECTION);
  let filtered = all.filter((e) => e.projectId === projectId);

  if (filters?.triggerType) {
    filtered = filtered.filter((e) => e.triggerType === filters.triggerType);
  }
  if (filters?.result) {
    filtered = filtered.filter((e) => e.result === filters.result);
  }

  // Sort by triggeredAt descending
  filtered.sort(
    (a, b) =>
      new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime(),
  );

  if (filters?.limit) {
    filtered = filtered.slice(0, filters.limit);
  }

  return filtered;
}

// ── Notification sending ─────────────────────────

export async function sendNotification(
  webhook: OutgoingWebhook,
  execution: CIExecution,
  projectName?: string,
): Promise<void> {
  if (!webhook.active) return;
  if (
    webhook.notifyOn === "failure-only" &&
    execution.result === "pass"
  ) {
    return;
  }

  const payload: NotificationPayload = {
    event: execution.result === "pass" ? "completed" : "failed",
    execution: {
      id: execution.id,
      name: execution.name,
      result: execution.result,
      passed: execution.passed,
      total: execution.total,
      durationMs: execution.durationMs,
      triggeredAt: execution.triggeredAt,
      completedAt: execution.completedAt,
    },
    project: {
      id: execution.projectId,
      name: projectName,
    },
  };

  try {
    const resp = await fetch(webhook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    webhook.lastTriggered = new Date().toISOString();
    webhook.lastStatus = resp.ok ? "success" : "error";
    log.info(`Notification sent to ${webhook.name}: ${resp.status}`);
  } catch (err) {
    webhook.lastTriggered = new Date().toISOString();
    webhook.lastStatus = "error";
    log.error(
      `Notification failed for ${webhook.name}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Send notifications for a CI execution to all matching outgoing webhooks */
export async function sendAllNotifications(
  projectId: string,
  execution: CIExecution,
): Promise<void> {
  const config = await getWebhookConfig(projectId);
  if (!config || config.outgoing.length === 0) return;

  for (const webhook of config.outgoing) {
    await sendNotification(webhook, execution);
  }

  // Persist updated webhook status
  await storage.write(WEBHOOK_CONFIG_COLLECTION, projectId, config);
}

// ── Process webhook events ───────────────────────

export async function processGitHubPush(
  projectId: string,
  payload: GitHubPushPayload,
): Promise<{ triggered: boolean; executionId?: string; rules: string[] }> {
  const branch = extractBranchFromRef(payload.ref);
  const changedFiles = extractGitHubChangedFiles(payload);
  const rules = await getTriggerRules(projectId);

  const ctx: MatchContext = {
    branch,
    changedFiles,
    eventType: "push",
  };

  const matchedRules = rules.filter((r) => shouldTrigger(r, ctx));
  if (matchedRules.length === 0) {
    return { triggered: false, rules: [] };
  }

  // Execute first matching rule (priority-based in future)
  const rule = matchedRules[0];
  const execution = await createCIExecution({
    projectId,
    name: `${rule.name} — ${branch}`,
    triggerType: "webhook",
    triggerDetail: `GitHub push to ${branch} (${payload.head_commit?.id?.slice(0, 7) ?? "unknown"})`,
    environmentSlug: rule.action.environmentSlug ?? "default",
    ruleId: rule.id,
    result: "running",
    passed: 0,
    total: 0,
    durationMs: 0,
    triggeredAt: new Date().toISOString(),
  });

  // Update rule lastTriggered
  await updateTriggerRule(rule.id, {
    lastTriggered: new Date().toISOString(),
  });

  return {
    triggered: true,
    executionId: execution.id,
    rules: matchedRules.map((r) => r.name),
  };
}

export async function processGitLabPush(
  projectId: string,
  payload: GitLabPushPayload,
): Promise<{ triggered: boolean; executionId?: string; rules: string[] }> {
  const branch = extractBranchFromRef(payload.ref);
  const changedFiles = extractGitLabChangedFiles(payload);
  const rules = await getTriggerRules(projectId);

  const ctx: MatchContext = {
    branch,
    changedFiles,
    eventType: "push",
  };

  const matchedRules = rules.filter((r) => shouldTrigger(r, ctx));
  if (matchedRules.length === 0) {
    return { triggered: false, rules: [] };
  }

  const rule = matchedRules[0];
  const execution = await createCIExecution({
    projectId,
    name: `${rule.name} — ${branch}`,
    triggerType: "webhook",
    triggerDetail: `GitLab push to ${branch} (${payload.commits?.[0]?.id?.slice(0, 7) ?? "unknown"})`,
    environmentSlug: rule.action.environmentSlug ?? "default",
    ruleId: rule.id,
    result: "running",
    passed: 0,
    total: 0,
    durationMs: 0,
    triggeredAt: new Date().toISOString(),
  });

  await updateTriggerRule(rule.id, {
    lastTriggered: new Date().toISOString(),
  });

  return {
    triggered: true,
    executionId: execution.id,
    rules: matchedRules.map((r) => r.name),
  };
}

/** Manually trigger a CI execution */
export async function triggerManualExecution(
  projectId: string,
  opts: {
    type: "smoke" | "regression" | "security" | "full";
    environmentSlug?: string;
    name?: string;
    ruleId?: string;
  },
): Promise<CIExecution> {
  const execution = await createCIExecution({
    projectId,
    name: opts.name ?? `手动触发 — ${opts.type}`,
    triggerType: "manual",
    triggerDetail: `手动触发 ${opts.type} 测试`,
    environmentSlug: opts.environmentSlug ?? "default",
    ruleId: opts.ruleId,
    result: "running",
    passed: 0,
    total: 0,
    durationMs: 0,
    triggeredAt: new Date().toISOString(),
  });

  return execution;
}
