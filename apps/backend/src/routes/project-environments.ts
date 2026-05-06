/**
 * Project-scoped environment routes
 *
 * 前端调用 POST /projects/environments/reorder，
 * 但后端原路由为 PUT /environments/reorder。
 * 此文件适配 project-scoped POST 路径。
 */

import type { Environment } from "@nexqa/shared";
import { Hono } from "hono";
import { storage } from "../services/storage.js";

const COLLECTION = "environments";

export const projectEnvironmentRoutes = new Hono()

  // POST /projects/environments/reorder（body: projectId + orders）
  .post("/environments/reorder", async (c) => {
    const body = await c.req.json();
    const projectId = body.projectId;
    if (!projectId) {
      return c.json({ error: "projectId is required" }, 400);
    }

    const orders: Array<{ id: string; order: number }> = body.orders;
    if (!Array.isArray(orders) || orders.length === 0) {
      return c.json({ error: "orders array is required" }, 400);
    }

    let updated = 0;
    for (const item of orders) {
      const env = await storage.read<Environment>(COLLECTION, item.id);
      if (!env) continue;
      (env as any).order = item.order;
      env.updatedAt = new Date().toISOString();
      await storage.write(COLLECTION, env.id, env);
      updated++;
    }
    return c.json({ updated });
  });
