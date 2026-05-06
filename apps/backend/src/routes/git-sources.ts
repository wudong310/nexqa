import type { GitSource, ScanRecord } from "@nexqa/shared";
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
  })
  .get("/:id/diff", async (c) => {
    const id = c.req.param("id");
    const gitSource = await storage.read<GitSource>(COLLECTION, id);
    if (!gitSource) return c.json({ error: "Git source 不存在" }, 404);

    // 获取该 GitSource 所有 scan-records，按 startedAt 倒序排
    const allScans = await storage.list<ScanRecord>("scan-records");
    const completedScans = allScans
      .filter((s) => s.gitSourceId === id && s.status === "completed")
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    if (completedScans.length === 0) {
      return c.json({
        scanId: null,
        previousScanId: null,
        summary: { added: 0, updated: 0, removed: 0 },
        changes: [],
      });
    }

    const latestScan = completedScans[0];
    const previousScan = completedScans.length > 1 ? completedScans[1] : null;

    // 从最近一次 ScanRecord.result.changes 读取详细变更
    const changes = latestScan.result?.changes ?? [];

    const summary = {
      added: latestScan.result?.endpointsNew ?? 0,
      updated: latestScan.result?.endpointsUpdated ?? 0,
      removed: latestScan.result?.endpointsRemoved ?? 0,
    };

    return c.json({
      scanId: latestScan.id,
      previousScanId: previousScan?.id ?? null,
      summary,
      changes,
    });
  });
