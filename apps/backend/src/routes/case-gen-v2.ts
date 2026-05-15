/**
 * case-gen-v2 — API 端点用例生成路由
 *
 * 对标 plan-gen-v2.ts：异步触发 + 轮询 + Agent 回写
 *
 * Routes:
 *   POST /projects/:projectId/case-gen-v2
 *   GET  /case-gen-tasks/:id
 *   GET  /projects/:projectId/case-gen-v2/tasks
 *   PUT  /case-gen-tasks/:id/result
 *   POST /case-gen-tasks/:id/adopt
 */

import { randomUUID } from "node:crypto";
import type { CaseGenResult, CaseGenTask, Project } from "@nexqa/shared";
import {
  AdoptCaseGenRequestSchema,
  CaseGenResultSchema,
  StartCaseGenRequestSchema,
} from "@nexqa/shared";
import { Hono } from "hono";
import { createLogger } from "../services/logger.js";
import { createOpenClawClient } from "../services/openclaw-client.js";
import { CaseGenV2Service } from "../services/case-gen-v2.js";
import { storage } from "../services/storage.js";

async function getOpenClawToken(): Promise<string | null> {
  try {
    const raw = await storage.readRaw("settings.json");
    if (raw) {
      const settings = JSON.parse(raw);
      if (settings.openclawToken) return settings.openclawToken as string;
    }
  } catch {
    // ignore
  }
  return process.env.OPENCLAW_GATEWAY_TOKEN ?? null;
}

const serviceCache = new Map<string, CaseGenV2Service>();

function getOrCreateService(
  gatewayUrl: string,
  token: string,
  broadcaster?: { broadcast: (event: unknown) => void },
): CaseGenV2Service {
  const cacheKey = `${gatewayUrl}::${token}`;
  const cached = serviceCache.get(cacheKey);
  if (cached) {
    if (broadcaster) cached.updateBroadcaster(broadcaster);
    return cached;
  }

  const client = createOpenClawClient({ gatewayUrl, token });
  const service = new CaseGenV2Service(client, broadcaster);
  serviceCache.set(cacheKey, service);
  return service;
}

export const caseGenV2ProjectRoutes = new Hono()
  // GET /:projectId/case-gen-v2/tasks — 列表
  .get("/:projectId/case-gen-v2/tasks", async (c) => {
    const projectId = c.req.param("projectId");

    const project = await storage.read<Project>("projects", projectId);
    if (!project) {
      return c.json({ error: "项目不存在", code: "PROJECT_NOT_FOUND" }, 404);
    }

    const allTasks = await storage.list<CaseGenTask>("case-gen-tasks");
    const records = allTasks
      .filter((t) => t.projectId === projectId)
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      );

    return c.json({ records });
  })

  // POST /:projectId/case-gen-v2 — 触发生成
  .post("/:projectId/case-gen-v2", async (c) => {
    const log = createLogger("case-gen-v2", c.req.header("x-trace-id"));
    const projectId = c.req.param("projectId");

    const rawBody = await c.req.json().catch(() => null);
    if (!rawBody) return c.json({ error: "请求体不能为空" }, 400);

    const parse = StartCaseGenRequestSchema.safeParse(rawBody);
    if (!parse.success) {
      const messages = parse.error.errors.map((e) =>
        e.path.length > 0 ? `${e.path.join(".")}: ${e.message}` : e.message,
      );
      return c.json({ error: messages.join("; ") }, 400);
    }
    const body = parse.data;

    const project = await storage.read<Project>("projects", projectId);
    if (!project) {
      return c.json({ error: "项目不存在", code: "PROJECT_NOT_FOUND" }, 404);
    }

    const conn = project.openclawConnections?.find(
      (item) => item.id === body.openclawConnectionId,
    );
    if (!conn) {
      return c.json({ error: "OpenClaw 连接配置不存在" }, 400);
    }

    const token = await getOpenClawToken();
    if (!token) {
      return c.json(
        {
          error:
            "OpenClaw Gateway token 未配置，请在设置中配置 openclawToken 或设置环境变量 OPENCLAW_GATEWAY_TOKEN",
        },
        400,
      );
    }

    const broadcaster =
      (c.var as unknown as { broadcaster?: { broadcast: (event: unknown) => void } })
        .broadcaster;
    const service = getOrCreateService(conn.gatewayUrl, token, broadcaster);

    try {
      const task = await service.startGeneration({
        projectId,
        endpointIds: body.endpointIds,
        tags: body.tags,
        maxCasesPerEndpoint: body.maxCasesPerEndpoint,
        openclawConnectionId: body.openclawConnectionId,
      });

      log.info(
        `用例生成已触发: id=${task.id}, projectId=${projectId}, endpoints=${body.endpointIds.length}`,
      );

      return c.json(
        {
          id: task.id,
          status: task.status,
          message: "正在通过 OpenClaw 生成测试用例...",
        },
        202,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`用例生成启动失败: ${msg}`);
      return c.json({ error: msg }, 500);
    }
  });

export const caseGenV2TaskRoutes = new Hono()
  // GET /case-gen-tasks/:id — 查询
  .get("/case-gen-tasks/:id", async (c) => {
    const id = c.req.param("id");
    const task = await storage.read<CaseGenTask>("case-gen-tasks", id);
    if (!task) {
      return c.json({ error: "任务不存在", code: "TASK_NOT_FOUND" }, 404);
    }

    switch (task.status) {
      case "pending":
      case "generating":
        return c.json({
          id: task.id,
          status: task.status,
          progress: task.status === "pending" ? "等待启动..." : "正在生成用例...",
          logs: task.logs || [],
        });
      case "completed":
        return c.json({
          id: task.id,
          status: task.status,
          result: task.result,
          logs: task.logs || [],
        });
      case "failed":
        return c.json({
          id: task.id,
          status: task.status,
          error: task.error,
          logs: task.logs || [],
        });
    }
  })

  // PUT /case-gen-tasks/:id/result — Agent 回写
  .put("/case-gen-tasks/:id/result", async (c) => {
    const log = createLogger("case-gen-v2", c.req.header("x-trace-id"));
    const id = c.req.param("id");

    const rawBody = await c.req.json().catch(() => null);
    if (!rawBody) return c.json({ error: "请求体不能为空" }, 400);

    const parse = CaseGenResultSchema.safeParse(rawBody);
    if (!parse.success) {
      const messages = parse.error.errors.map((e) =>
        e.path.length > 0 ? `${e.path.join(".")}: ${e.message}` : e.message,
      );
      return c.json({ error: `结果格式校验失败: ${messages.join("; ")}` }, 400);
    }

    const task = await storage.read<CaseGenTask>("case-gen-tasks", id);
    if (!task) {
      return c.json({ error: "任务不存在", code: "TASK_NOT_FOUND" }, 404);
    }

    // 幂等：终态允许覆写
    if (task.status === "completed" || task.status === "failed") {
      log.warn(`task ${id} 已终态 (${task.status})，覆写结果`);
    }

    task.status = "completed";
    task.result = parse.data as CaseGenResult;
    task.error = null;
    task.completedAt = new Date().toISOString();

    await storage.write("case-gen-tasks", id, task);

    log.info(`用例结果已回写: id=${id}, cases=${parse.data.cases.length}`);

    return c.json({ ok: true, id: task.id, status: task.status });
  })

  // POST /case-gen-tasks/:id/adopt — 采纳用例
  .post("/case-gen-tasks/:id/adopt", async (c) => {
    const log = createLogger("case-gen-v2", c.req.header("x-trace-id"));
    const id = c.req.param("id");

    const task = await storage.read<CaseGenTask>("case-gen-tasks", id);
    if (!task) {
      return c.json({ error: "任务不存在", code: "TASK_NOT_FOUND" }, 404);
    }
    if (task.status !== "completed" || !task.result) {
      return c.json({ error: "任务未完成，无法采纳", code: "TASK_NOT_COMPLETED" }, 400);
    }

    const rawBody = await c.req.json().catch(() => null);
    const parsed = AdoptCaseGenRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) =>
        e.path.length > 0 ? `${e.path.join(".")}: ${e.message}` : e.message,
      );
      return c.json({ error: messages.join("; ") }, 400);
    }

    const caseIds = parsed.data.caseIds;
    const selected = task.result.cases.filter((cs) => caseIds.includes(cs.id));
    if (selected.length === 0) {
      return c.json({ error: "未找到匹配的用例" }, 400);
    }

    // 采纳：写入 test-cases
    const now = new Date().toISOString();
    const adoptedCaseIds: string[] = [];
    for (const gc of selected) {
      const tcId = randomUUID();
      adoptedCaseIds.push(tcId);
      await storage.write("test-cases", tcId, {
        id: tcId,
        endpointId: gc.endpointId,
        name: gc.name,
        request: gc.request,
        expected: gc.expected,
        tags: gc.tags,
        apiChangeFlag: undefined,
        generationSource: "ai",
        isLocked: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    log.info(`用例已采纳: taskId=${id}, count=${adoptedCaseIds.length}`);

    return c.json({
      ok: true,
      adoptedCount: adoptedCaseIds.length,
      adoptedCaseIds,
    });
  });
