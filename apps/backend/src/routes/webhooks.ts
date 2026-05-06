/**
 * webhooks.ts — Webhook 接收路由
 *
 * API 端点：
 * - POST /webhooks/github — 接收 GitHub push/PR 事件
 * - POST /webhooks/gitlab — 接收 GitLab push 事件
 * - POST /webhooks/:projectId/trigger — 通用触发端点
 */

import { Hono } from "hono";
import { createLogger } from "../services/logger.js";
import {
  verifyGitHubSignature,
  verifyGitLabToken,
  processGitHubPush,
  processGitLabPush,
  triggerManualExecution,
  getWebhookConfig,
  getCIConfig,
} from "../services/ci-engine.js";
import type {
  GitHubPushPayload,
  GitLabPushPayload,
  WebhookTriggerRequest,
} from "../services/ci-types.js";
import { storage } from "../services/storage.js";

export const webhookRoutes = new Hono()

  // ── POST /webhooks/github ────────────────────────
  // Receives GitHub Webhook events (push / pull_request)
  .post("/github", async (c) => {
    const log = createLogger("webhook-github", c.req.header("x-trace-id"));
    const signature = c.req.header("X-Hub-Signature-256");
    const event = c.req.header("X-GitHub-Event");

    if (!signature || !event) {
      return c.json({ error: "Missing GitHub webhook headers" }, 400);
    }

    const rawBody = await c.req.text();
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    // We need to find the matching project by checking all CI configs
    // The GitHub webhook is configured with a secret per project
    const allConfigs = await storage.list<{ projectId: string; webhookSecret: string }>(
      "ci-configs",
    );

    let matchedProjectId: string | null = null;
    for (const config of allConfigs) {
      if (config.webhookSecret && verifyGitHubSignature(rawBody, signature, config.webhookSecret)) {
        matchedProjectId = config.projectId;
        break;
      }
    }

    if (!matchedProjectId) {
      return c.json({ error: "Invalid signature — no matching project" }, 401);
    }

    log.info(`GitHub ${event} event for project ${matchedProjectId}`);

    if (event === "push") {
      const pushPayload = payload as unknown as GitHubPushPayload;
      const result = await processGitHubPush(matchedProjectId, pushPayload);

      if (result.triggered) {
        return c.json(
          {
            triggered: true,
            executionId: result.executionId,
            matchedRules: result.rules,
            message: `Triggered ${result.rules.length} rule(s)`,
          },
          202,
        );
      }

      return c.json({
        triggered: false,
        message: "Push event received but no matching trigger rules",
      });
    }

    if (event === "pull_request") {
      // For now, treat PR events similar to push with the PR head branch
      log.info("Pull request event received — processing as push-like trigger");
      const pr = payload as unknown as {
        pull_request?: { head?: { ref?: string; sha?: string } };
        action?: string;
      };

      if (pr.action === "opened" || pr.action === "synchronize") {
        const fakePush: GitHubPushPayload = {
          ref: `refs/heads/${pr.pull_request?.head?.ref ?? "unknown"}`,
          before: "",
          after: pr.pull_request?.head?.sha ?? "",
          repository: (payload as Record<string, unknown>).repository as GitHubPushPayload["repository"],
          pusher: { name: "github-pr" },
          commits: [],
        };
        const result = await processGitHubPush(matchedProjectId, fakePush);
        return c.json({
          triggered: result.triggered,
          executionId: result.executionId,
          matchedRules: result.rules,
        }, result.triggered ? 202 : 200);
      }

      return c.json({ triggered: false, message: `PR action '${pr.action}' ignored` });
    }

    // Ping event
    if (event === "ping") {
      return c.json({ message: "pong", projectId: matchedProjectId });
    }

    return c.json({ message: `Event '${event}' not handled` });
  })

  // ── POST /webhooks/gitlab ────────────────────────
  // Receives GitLab Webhook events
  .post("/gitlab", async (c) => {
    const log = createLogger("webhook-gitlab", c.req.header("x-trace-id"));
    const token = c.req.header("X-Gitlab-Token");

    if (!token) {
      return c.json({ error: "Missing X-Gitlab-Token header" }, 400);
    }

    const body = await c.req.json<GitLabPushPayload>();

    // Find matching project
    const allConfigs = await storage.list<{ projectId: string; webhookSecret: string }>(
      "ci-configs",
    );

    let matchedProjectId: string | null = null;
    for (const config of allConfigs) {
      if (config.webhookSecret && verifyGitLabToken(token, config.webhookSecret)) {
        matchedProjectId = config.projectId;
        break;
      }
    }

    if (!matchedProjectId) {
      return c.json({ error: "Invalid token — no matching project" }, 401);
    }

    log.info(`GitLab push event for project ${matchedProjectId}`);

    const result = await processGitLabPush(matchedProjectId, body);

    if (result.triggered) {
      return c.json(
        {
          triggered: true,
          executionId: result.executionId,
          matchedRules: result.rules,
          message: `Triggered ${result.rules.length} rule(s)`,
        },
        202,
      );
    }

    return c.json({
      triggered: false,
      message: "Push event received but no matching trigger rules",
    });
  })

  // ── POST /webhooks/trigger ────────────
  // Generic trigger endpoint — external CI can call this（body: projectId）
  .post("/trigger", async (c) => {
    const log = createLogger("webhook-trigger", c.req.header("x-trace-id"));
    const body = await c.req.json<WebhookTriggerRequest & { projectId?: string }>();
    const projectId = body.projectId;
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    // Bearer token auth
    const authHeader = c.req.header("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    const webhookConfig = await getWebhookConfig(projectId);
    if (!webhookConfig?.incoming.enabled || token !== webhookConfig.incoming.token) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (!body.type) {
      return c.json({ error: "type is required (smoke | regression | security | full)" }, 400);
    }

    log.info(`Manual webhook trigger: ${body.type} for project ${projectId}`);

    const execution = await triggerManualExecution(projectId, {
      type: body.type,
      environmentSlug: body.env,
      name: `Webhook 触发 — ${body.type}`,
    });

    return c.json(
      {
        executionId: execution.id,
        number: execution.number,
        status: "running",
        message: `${body.type} test triggered`,
      },
      202,
    );
  });
