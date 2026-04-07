/**
 * Project-scoped CI/CD routes
 *
 * 前端用 /projects/... 路径调用 CI/CD 功能，
 * 此文件将这些路径适配到已有的 ci-engine 服务。
 *
 * 前端调用:
 *   GET    /projects/webhook-config?projectId=xxx                        → ensureWebhookConfig
 *   POST   /projects/webhook-config/regenerate-token                     → regenerateWebhookToken（body: projectId）
 *   POST   /projects/outgoing-webhooks                                   → addOutgoingWebhook（body: projectId）
 *   POST   /projects/outgoing-webhooks/delete                            → removeOutgoingWebhook（body: projectId + id）
 *   POST   /projects/outgoing-webhooks/test                              → sendNotification（body: projectId + id）
 *   GET    /projects/trigger-rules?projectId=xxx                         → getTriggerRules
 *   POST   /projects/trigger-rules                                       → createTriggerRule（body: projectId）
 *   POST   /projects/trigger-rules/toggle                                → toggleTriggerRule（body: id）
 *   POST   /projects/trigger-rules/delete                                → deleteTriggerRule（body: id）
 *   GET    /projects/cicd-executions?projectId=xxx                       → listCIExecutions
 */

import { Hono } from "hono";
import { createLogger } from "../services/logger.js";
import {
  ensureWebhookConfig,
  regenerateWebhookToken,
  addOutgoingWebhook,
  removeOutgoingWebhook,
  getTriggerRules,
  createTriggerRule,
  toggleTriggerRule,
  deleteTriggerRule,
  listCIExecutions,
  sendNotification,
} from "../services/ci-engine.js";
import type { TriggerRule, OutgoingWebhook, CIExecution } from "../services/ci-types.js";

export const projectCiRoutes = new Hono()

  // ══════════════════════════════════════════════════
  // Webhook Config
  // ══════════════════════════════════════════════════

  // GET /projects/webhook-config?projectId=xxx
  .get("/webhook-config", async (c) => {
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    const config = await ensureWebhookConfig(projectId);

    const masked = {
      ...config,
      incoming: {
        ...config.incoming,
        token:
          config.incoming.token.slice(0, 12) +
          "..." +
          config.incoming.token.slice(-4),
      },
    };

    return c.json(masked);
  })

  // POST /projects/webhook-config/regenerate-token（body: projectId）
  .post("/webhook-config/regenerate-token", async (c) => {
    const log = createLogger("project-ci", c.req.header("x-trace-id"));
    const body = await c.req.json<{ projectId?: string }>();
    const projectId = body.projectId;
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    const config = await regenerateWebhookToken(projectId);
    log.info(`Regenerated webhook token for project ${projectId}`);

    return c.json({
      token: config.incoming.token,
      tokenCreatedAt: config.incoming.tokenCreatedAt,
      message: "Token regenerated. This is the only time the full token will be shown.",
    });
  })

  // ══════════════════════════════════════════════════
  // Outgoing Webhooks
  // ══════════════════════════════════════════════════

  // POST /projects/outgoing-webhooks（body: projectId）
  .post("/outgoing-webhooks", async (c) => {
    const log = createLogger("project-ci", c.req.header("x-trace-id"));
    const body = await c.req.json<Omit<OutgoingWebhook, "id"> & { projectId?: string }>();
    const projectId = body.projectId;
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    if (!body.name || !body.url) {
      return c.json({ error: "name and url are required" }, 400);
    }

    const webhook = await addOutgoingWebhook(projectId, body);
    log.info(`Added outgoing webhook '${webhook.name}' for project ${projectId}`);

    return c.json(webhook, 201);
  })

  // POST /projects/outgoing-webhooks/delete（body: projectId + id）
  .post("/outgoing-webhooks/delete", async (c) => {
    const body = await c.req.json<{ projectId?: string; id?: string }>();
    const projectId = body.projectId;
    const id = body.id;
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }
    if (!id) {
      return c.json({ error: "id is required" }, 400);
    }

    const removed = await removeOutgoingWebhook(projectId, id);
    if (!removed) {
      return c.json({ error: "Outgoing webhook not found" }, 404);
    }

    return c.json({ success: true });
  })

  // POST /projects/outgoing-webhooks/test（body: projectId + id）
  .post("/outgoing-webhooks/test", async (c) => {
    const log = createLogger("project-ci", c.req.header("x-trace-id"));
    const body = await c.req.json<{ projectId?: string; id?: string }>();
    const projectId = body.projectId;
    const id = body.id;
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }
    if (!id) {
      return c.json({ error: "id is required" }, 400);
    }

    const config = await ensureWebhookConfig(projectId);
    const webhook = config.outgoing.find((w) => w.id === id);
    if (!webhook) {
      return c.json({ error: "Outgoing webhook not found" }, 404);
    }

    const testExecution: CIExecution = {
      id: "test-notification",
      projectId,
      number: 0,
      name: "🧪 测试通知",
      triggerType: "manual",
      triggerDetail: "测试通知发送",
      environmentSlug: "test",
      result: "pass",
      passed: 5,
      total: 5,
      durationMs: 1234,
      triggeredAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    await sendNotification(webhook, testExecution);
    log.info(`Test notification sent to '${webhook.name}'`);

    return c.json({
      success: true,
      status: webhook.lastStatus,
      message: `Test notification sent to ${webhook.name}`,
    });
  })

  // ══════════════════════════════════════════════════
  // Trigger Rules
  // ══════════════════════════════════════════════════

  // GET /projects/trigger-rules?projectId=xxx
  .get("/trigger-rules", async (c) => {
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    const rules = await getTriggerRules(projectId);
    return c.json(rules);
  })

  // POST /projects/trigger-rules（body: projectId）
  .post("/trigger-rules", async (c) => {
    const log = createLogger("project-ci", c.req.header("x-trace-id"));
    const body = await c.req.json<Omit<TriggerRule, "id"> & { projectId?: string }>();
    const projectId = body.projectId;
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    if (!body.name) {
      return c.json({ error: "name is required" }, 400);
    }
    if (!body.trigger?.type) {
      return c.json({ error: "trigger.type is required" }, 400);
    }
    if (!body.action?.type) {
      return c.json({ error: "action.type is required" }, 400);
    }

    const rule = await createTriggerRule(projectId, body);
    log.info(`Created trigger rule '${rule.name}' for project ${projectId}`);

    return c.json(rule, 201);
  })

  // POST /projects/trigger-rules/toggle（body: id）
  .post("/trigger-rules/toggle", async (c) => {
    const body = await c.req.json<{ id?: string }>();
    const id = body.id;
    if (!id) {
      return c.json({ error: "id is required" }, 400);
    }

    const toggled = await toggleTriggerRule(id);
    if (!toggled) {
      return c.json({ error: "Trigger rule not found" }, 404);
    }
    return c.json(toggled);
  })

  // POST /projects/trigger-rules/delete（body: id）
  .post("/trigger-rules/delete", async (c) => {
    const body = await c.req.json<{ id?: string }>();
    const id = body.id;
    if (!id) {
      return c.json({ error: "id is required" }, 400);
    }

    const removed = await deleteTriggerRule(id);
    if (!removed) {
      return c.json({ error: "Trigger rule not found" }, 404);
    }
    return c.json({ success: true });
  })

  // ══════════════════════════════════════════════════
  // CI/CD Executions
  // ══════════════════════════════════════════════════

  // GET /projects/cicd-executions?projectId=xxx
  .get("/cicd-executions", async (c) => {
    const projectId = c.req.query("projectId");
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    const triggerType = c.req.query("triggerType");
    const result = c.req.query("result");
    const limit = Number(c.req.query("limit")) || 50;

    const executions = await listCIExecutions(projectId, {
      triggerType,
      result,
      limit,
    });

    const totalExecutions = executions.length;
    const passedCount = executions.filter((e) => e.result === "pass").length;
    const failedCount = executions.filter((e) => e.result === "fail").length;
    const errorCount = executions.filter((e) => e.result === "error").length;
    const avgPassRate =
      totalExecutions > 0
        ? executions.reduce(
            (sum, e) => sum + (e.total > 0 ? e.passed / e.total : 0),
            0,
          ) / totalExecutions
        : 0;
    const avgDuration =
      totalExecutions > 0
        ? executions.reduce((sum, e) => sum + e.durationMs, 0) / totalExecutions
        : 0;

    return c.json({
      items: executions,
      summary: {
        total: totalExecutions,
        passed: passedCount,
        failed: failedCount,
        errors: errorCount,
        avgPassRate: Math.round(avgPassRate * 1000) / 1000,
        avgDurationMs: Math.round(avgDuration),
      },
    });
  });
