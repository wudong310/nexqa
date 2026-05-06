/**
 * Project-scoped chain-gen routes
 *
 * 前端用 /projects/chain-gen/... 路径调用链生成功能，
 * 此文件将这些路径适配到已有的 chain-gen 服务。
 *
 * 前端调用:
 *   POST /projects/chain-gen/analyze   → analyzeAndGenerate（body: projectId）
 *   POST /projects/chain-gen/generate  → analyzeAndGenerate（body: projectId）
 *   POST /projects/chain-gen/adopt     → adoptChains（body: projectId）
 */

import type { Project } from "@nexqa/shared";
import { Hono } from "hono";
import { createLogger } from "../services/logger.js";
import {
  analyzeAndGenerate,
  adoptChains,
  type AdoptRequest,
} from "../services/chain-gen.js";
import { storage } from "../services/storage.js";

export const projectChainGenRoutes = new Hono()

  // POST /projects/chain-gen/analyze（body: projectId）
  .post("/chain-gen/analyze", async (c) => {
    const log = createLogger("project-chain-gen", c.req.header("x-trace-id"));
    const body = await c.req.json<{
      projectId?: string;
      scope?: "all" | "selected";
      endpointIds?: string[];
    }>().catch(() => ({}));

    const projectId = (body as { projectId?: string }).projectId;
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    const project = await storage.read<Project>("projects", projectId);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    log.info(`触发链生成(analyze): ${project.name}`);

    try {
      const task = await analyzeAndGenerate(
        projectId,
        (body as any).scope || "all",
        (body as any).endpointIds,
      );

      return c.json(
        {
          taskId: task.id,
          status: task.status,
          message: "AI 正在分析 API 数据依赖关系...",
        },
        202,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`链生成触发失败: ${msg}`);
      return c.json({ error: msg }, 500);
    }
  })

  // POST /projects/chain-gen/generate（body: projectId）
  .post("/chain-gen/generate", async (c) => {
    const log = createLogger("project-chain-gen", c.req.header("x-trace-id"));
    const body = await c.req.json<{
      projectId?: string;
      taskId?: string;
      scope?: "all" | "selected";
      endpointIds?: string[];
    }>().catch(() => ({}));

    const projectId = (body as { projectId?: string }).projectId;
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    const project = await storage.read<Project>("projects", projectId);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    log.info(`触发链生成(generate): ${project.name}`);

    try {
      const task = await analyzeAndGenerate(
        projectId,
        (body as any).scope || "all",
        (body as any).endpointIds,
      );

      return c.json(
        {
          taskId: task.id,
          status: task.status,
          message: "AI 正在分析 API 数据依赖关系并生成测试链...",
        },
        202,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`链生成触发失败: ${msg}`);
      return c.json({ error: msg }, 500);
    }
  })

  // POST /projects/chain-gen/adopt（body: projectId）
  .post("/chain-gen/adopt", async (c) => {
    const log = createLogger("project-chain-gen", c.req.header("x-trace-id"));
    const body = await c.req.json<{
      projectId?: string;
      taskId: string;
      chainIndexes: number[];
      modifications?: AdoptRequest["modifications"];
    }>();

    const projectId = body.projectId;
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    if (!body.taskId) {
      return c.json({ error: "taskId is required" }, 400);
    }

    if (!body.chainIndexes || body.chainIndexes.length === 0) {
      return c.json({ error: "chainIndexes is required" }, 400);
    }

    log.info(`采纳链: taskId=${body.taskId}, 选中 ${body.chainIndexes.length} 条`);

    try {
      const adopted = await adoptChains(body.taskId, projectId, {
        chainIndexes: body.chainIndexes,
        modifications: body.modifications,
      });

      return c.json({ adopted }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`采纳失败: ${msg}`);
      if (msg === "项目 ID 不匹配") {
        return c.json({ error: msg }, 403);
      }
      if (msg === "生成任务不存在" || msg === "任务尚未完成") {
        return c.json({ error: msg }, 400);
      }
      return c.json({ error: msg }, 500);
    }
  });
