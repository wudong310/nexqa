import { Hono } from "hono";
import { getChainGenTask } from "../services/chain-gen.js";
import { storage } from "../services/storage.js";

export const chainGenRoutes = new Hono()
  // GET /chain-gen/status?taskId=xxx — 查询生成进度
  .get("/status", async (c) => {
    const taskId = c.req.query("taskId");
    if (!taskId) {
      return c.json({ error: "taskId is required" }, 400);
    }

    const task = getChainGenTask(taskId);

    if (!task) {
      // Try loading from storage
      const stored = await storage.read<unknown>("chain-gen-tasks", taskId);
      if (stored) return c.json(stored);
      return c.json({ error: "Chain generation task not found" }, 404);
    }

    return c.json(task);
  });
