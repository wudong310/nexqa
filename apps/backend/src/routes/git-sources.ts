import type { GitSource } from "@nexqa/shared";
import { GitSourceSchema } from "@nexqa/shared";
import { Hono } from "hono";
import { v4 as uuid } from "uuid";
import { storage } from "../services/storage.js";

const COLLECTION = "git-sources";

/** 脱敏 token：保留前4+后4位，中间用 **** 替换 */
function maskToken(token: string | undefined): string | undefined {
  if (!token) return token;
  if (token.length <= 8) return "****";
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}

/** 返回列表时对 auth.token 脱敏 */
function maskGitSource(source: GitSource): GitSource {
  return {
    ...source,
    auth: {
      ...source.auth,
      token: maskToken(source.auth.token),
    },
  };
}

export const gitSourceRoutes = new Hono()
  .get("/", async (c) => {
    const projectId = c.req.query("projectId");
    const all = await storage.list<GitSource>(COLLECTION);
    const filtered = projectId
      ? all.filter((s) => s.projectId === projectId)
      : all;
    return c.json(filtered.map(maskGitSource));
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const source = await storage.read<GitSource>(COLLECTION, id);
    if (!source) return c.json({ error: "Git source 不存在" }, 404);
    return c.json(maskGitSource(source));
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    const now = new Date().toISOString();
    const id = uuid();

    const data = GitSourceSchema.parse({
      ...body,
      id,
      createdAt: now,
      updatedAt: now,
    });

    await storage.write(COLLECTION, id, data);
    return c.json(data, 201);
  })
  .put("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await storage.read<GitSource>(COLLECTION, id);
    if (!existing) return c.json({ error: "Git source 不存在" }, 404);

    const body = await c.req.json();
    const now = new Date().toISOString();

    // 如果 body 里没有 auth.token 或为 undefined，保留原值
    let auth = existing.auth;
    if (body.auth !== undefined) {
      auth = {
        ...existing.auth,
        ...body.auth,
      };
      if (body.auth.token === undefined) {
        auth.token = existing.auth.token;
      }
    }

    const updated: GitSource = {
      ...existing,
      ...body,
      id, // 不允许修改 id
      auth,
      createdAt: existing.createdAt, // 不允许修改 createdAt
      updatedAt: now,
    };

    await storage.write(COLLECTION, id, updated);
    return c.json(updated);
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await storage.read<GitSource>(COLLECTION, id);
    if (!existing) return c.json({ error: "Git source 不存在" }, 404);
    await storage.remove(COLLECTION, id);
    return c.json({ success: true });
  });
