/**
 * Git Sources CRUD 集成测试
 *
 * 覆盖：
 * - 创建 GitSource（校验必填字段、默认值生成）
 * - 列表查询（projectId 过滤、token 脱敏验证）
 * - 详情查询（token 脱敏）
 * - 更新（部分更新、token 不覆盖逻辑）
 * - 删除
 * - 404 场景（不存在的 id）
 *
 * 使用 vi.mock 隔离 storage 层为内存 Map
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";

// ── In-memory storage mock ────────────────────────────────────────────────────

const memoryStore = new Map<string, Map<string, string>>();

function getCollection(collection: string): Map<string, string> {
  if (!memoryStore.has(collection)) {
    memoryStore.set(collection, new Map());
  }
  return memoryStore.get(collection)!;
}

vi.mock("../services/storage.js", () => ({
  storage: {
    async read<T>(collection: string, id: string): Promise<T | null> {
      const col = getCollection(collection);
      const raw = col.get(id);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    },
    async write<T>(collection: string, id: string, data: T): Promise<void> {
      const col = getCollection(collection);
      col.set(id, JSON.stringify(data));
    },
    async list<T>(collection: string): Promise<T[]> {
      const col = getCollection(collection);
      return Array.from(col.values()).map((raw) => JSON.parse(raw) as T);
    },
    async remove(collection: string, id: string): Promise<boolean> {
      const col = getCollection(collection);
      return col.delete(id);
    },
  },
}));

// Must import after mock
const { gitSourceRoutes } = await import("../routes/git-sources.js");

// ── App setup ─────────────────────────────────────────────────────────────────

function createApp() {
  const app = new Hono();
  app.route("/git-sources", gitSourceRoutes);
  return app;
}

// ── Test data ─────────────────────────────────────────────────────────────────

const PROJECT_ID = randomUUID();
const OPENCLAW_CONN_ID = randomUUID();

function makeGitSourceBody(overrides = {}) {
  return {
    projectId: PROJECT_ID,
    name: "Test Repo",
    repoUrl: "https://github.com/test/repo.git",
    branch: "main",
    auth: {
      type: "token",
      token: "ghp_abcdefghijklmnopqrstuvwxyz123456",
    },
    openclawConnectionId: OPENCLAW_CONN_ID,
    scanConfig: {
      includePaths: ["src/**"],
      excludePaths: ["node_modules/**"],
      framework: "hono",
      maxFileSize: 100000,
      maxTotalFiles: 50,
    },
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Git Sources CRUD Routes", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    memoryStore.clear();
    app = createApp();
  });

  // ── POST /git-sources ─────────────────────────────────────────────────────

  describe("POST /git-sources", () => {
    it("should create a new GitSource with valid data", async () => {
      const body = makeGitSourceBody();
      const res = await app.request("/git-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.id).toBeDefined();
      expect(data.projectId).toBe(PROJECT_ID);
      expect(data.name).toBe("Test Repo");
      expect(data.repoUrl).toBe("https://github.com/test/repo.git");
      expect(data.branch).toBe("main");
      expect(data.auth.type).toBe("token");
      expect(data.auth.token).toBe("ghp_abcdefghijklmnopqrstuvwxyz123456");
      expect(data.openclawConnectionId).toBe(OPENCLAW_CONN_ID);
      expect(data.createdAt).toBeDefined();
      expect(data.updatedAt).toBeDefined();
    });

    it("should generate default values (branch, scanConfig, auth)", async () => {
      const body = {
        projectId: PROJECT_ID,
        name: "Minimal Repo",
        repoUrl: "https://github.com/test/minimal.git",
        openclawConnectionId: OPENCLAW_CONN_ID,
      };
      const res = await app.request("/git-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(201);
      const data = await res.json();

      // Defaults
      expect(data.branch).toBe("main");
      expect(data.auth).toEqual({ type: "none" });
      expect(data.scanConfig).toBeDefined();
      expect(data.scanConfig.includePaths).toEqual(["src/**"]);
      expect(data.scanConfig.excludePaths).toEqual(["node_modules/**", "dist/**", "*.test.*"]);
      expect(data.scanConfig.framework).toBe("auto");
      expect(data.scanConfig.maxFileSize).toBe(100000);
      expect(data.scanConfig.maxTotalFiles).toBe(50);
    });

    it("should generate unique IDs for each creation", async () => {
      const body = makeGitSourceBody();
      const res1 = await app.request("/git-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const res2 = await app.request("/git-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data1 = await res1.json();
      const data2 = await res2.json();
      expect(data1.id).not.toBe(data2.id);
    });

    it("should reject invalid data (missing required fields)", async () => {
      const body = { name: "No projectId" };
      const res = await app.request("/git-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // Zod validation should fail
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ── GET /git-sources ──────────────────────────────────────────────────────

  describe("GET /git-sources (list)", () => {
    it("should return all git sources with tokens masked", async () => {
      // Create two sources
      await app.request("/git-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeGitSourceBody({ name: "Repo 1" })),
      });
      await app.request("/git-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeGitSourceBody({ name: "Repo 2" })),
      });

      const res = await app.request("/git-sources");
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveLength(2);

      // Verify token is masked: first 4 + **** + last 4
      // "ghp_abcdefghijklmnopqrstuvwxyz123456" → "ghp_****3456"
      for (const source of data) {
        expect(source.auth.token).toBe("ghp_****3456");
        expect(source.auth.token).not.toBe("ghp_abcdefghijklmnopqrstuvwxyz123456");
      }
    });

    it("should filter by projectId", async () => {
      const otherProjectId = randomUUID();

      await app.request("/git-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeGitSourceBody({ name: "Project A" })),
      });
      await app.request("/git-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeGitSourceBody({ name: "Project B", projectId: otherProjectId })),
      });

      const res = await app.request(`/git-sources?projectId=${PROJECT_ID}`);
      const data = await res.json();

      expect(data).toHaveLength(1);
      expect(data[0].name).toBe("Project A");
    });

    it("should return empty array when no sources exist", async () => {
      const res = await app.request("/git-sources");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual([]);
    });

    it("should mask short tokens completely", async () => {
      await app.request("/git-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeGitSourceBody({
          auth: { type: "token", token: "short" },
        })),
      });

      const res = await app.request("/git-sources");
      const data = await res.json();
      expect(data[0].auth.token).toBe("****");
    });
  });

  // ── GET /git-sources/:id ──────────────────────────────────────────────────

  describe("GET /git-sources/:id (detail)", () => {
    it("should return a single git source with token masked", async () => {
      const createRes = await app.request("/git-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeGitSourceBody()),
      });
      const created = await createRes.json();

      const res = await app.request(`/git-sources/${created.id}`);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.id).toBe(created.id);
      expect(data.name).toBe("Test Repo");
      expect(data.auth.token).toBe("ghp_****3456");
    });

    it("should return 404 for non-existent id", async () => {
      const fakeId = randomUUID();
      const res = await app.request(`/git-sources/${fakeId}`);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });
  });

  // ── PUT /git-sources/:id ──────────────────────────────────────────────────

  describe("PUT /git-sources/:id (update)", () => {
    it("should update specified fields only", async () => {
      const createRes = await app.request("/git-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeGitSourceBody()),
      });
      const created = await createRes.json();

      const res = await app.request(`/git-sources/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Name" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.name).toBe("Updated Name");
      expect(data.repoUrl).toBe("https://github.com/test/repo.git"); // unchanged
      // updatedAt should be set (may or may not differ from created if same ms)
      expect(data.updatedAt).toBeDefined();
    });

    it("should preserve original token when auth.token is not provided", async () => {
      const createRes = await app.request("/git-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeGitSourceBody()),
      });
      const created = await createRes.json();

      // Update auth without token
      const res = await app.request(`/git-sources/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth: { type: "token" } }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();

      // Token should be preserved (not overwritten to undefined)
      expect(data.auth.token).toBe("ghp_abcdefghijklmnopqrstuvwxyz123456");
    });

    it("should update token when explicitly provided", async () => {
      const createRes = await app.request("/git-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeGitSourceBody()),
      });
      const created = await createRes.json();

      const res = await app.request(`/git-sources/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth: { type: "token", token: "new_token_value" } }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.auth.token).toBe("new_token_value");
    });

    it("should not allow modification of id or createdAt", async () => {
      const createRes = await app.request("/git-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeGitSourceBody()),
      });
      const created = await createRes.json();

      const res = await app.request(`/git-sources/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "hacked-id",
          createdAt: "2000-01-01T00:00:00.000Z",
          name: "Still OK",
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.id).toBe(created.id); // not changed
      expect(data.createdAt).toBe(created.createdAt); // not changed
      expect(data.name).toBe("Still OK");
    });

    it("should return 404 for non-existent id", async () => {
      const fakeId = randomUUID();
      const res = await app.request(`/git-sources/${fakeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Ghost" }),
      });
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /git-sources/:id ───────────────────────────────────────────────

  describe("DELETE /git-sources/:id", () => {
    it("should delete an existing git source", async () => {
      const createRes = await app.request("/git-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeGitSourceBody()),
      });
      const created = await createRes.json();

      const res = await app.request(`/git-sources/${created.id}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Verify it's gone
      const getRes = await app.request(`/git-sources/${created.id}`);
      expect(getRes.status).toBe(404);
    });

    it("should return 404 for non-existent id", async () => {
      const fakeId = randomUUID();
      const res = await app.request(`/git-sources/${fakeId}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });
  });

  // ── GET /git-sources/:id/diff ─────────────────────────────────────────────

  describe("GET /git-sources/:id/diff", () => {
    it("should return empty diff when no scans exist", async () => {
      const createRes = await app.request("/git-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeGitSourceBody()),
      });
      const created = await createRes.json();

      const res = await app.request(`/git-sources/${created.id}/diff`);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.scanId).toBeNull();
      expect(data.previousScanId).toBeNull();
      expect(data.summary).toEqual({ added: 0, updated: 0, removed: 0 });
      expect(data.changes).toEqual([]);
    });

    it("should return diff from latest completed scan", async () => {
      const createRes = await app.request("/git-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeGitSourceBody()),
      });
      const created = await createRes.json();

      // Manually insert scan records into storage
      const scanId = randomUUID();
      const scanRecord = {
        id: scanId,
        gitSourceId: created.id,
        projectId: PROJECT_ID,
        status: "completed",
        branch: "main",
        commitHash: "abc123",
        scannedFiles: ["src/routes.ts"],
        totalFilesFound: 1,
        result: {
          endpointsFound: 2,
          endpointsNew: 2,
          endpointsUpdated: 0,
          endpointsRemoved: 0,
          changes: [
            { type: "added", method: "GET", path: "/api/users", summary: "List users", endpointId: randomUUID() },
            { type: "added", method: "POST", path: "/api/users", summary: "Create user", endpointId: randomUUID() },
          ],
        },
        error: null,
        openclawRunId: null,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      getCollection("scan-records").set(scanId, JSON.stringify(scanRecord));

      const res = await app.request(`/git-sources/${created.id}/diff`);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.scanId).toBe(scanId);
      expect(data.previousScanId).toBeNull(); // only one scan
      expect(data.summary.added).toBe(2);
      expect(data.changes).toHaveLength(2);
    });

    it("should return 404 for non-existent git source", async () => {
      const fakeId = randomUUID();
      const res = await app.request(`/git-sources/${fakeId}/diff`);
      expect(res.status).toBe(404);
    });
  });
});
