/**
 * Scan Routes 测试
 *
 * 覆盖：
 * - POST /git-sources/:id/scan → 返回 202 + ScanRecord
 * - GET /scan-records?gitSourceId=xxx → 列表分页
 * - GET /scan-records/:id → 详情
 * - GET /git-sources/:id/diff → 变更列表（tested in git-sources.test.ts，此处覆盖补充场景）
 * - 参数校验（缺少 gitSourceId 返回 400）
 * - 不存在的资源返回 404
 *
 * Mock storage + source-scanner（不做真实 Git/OpenClaw 调用）
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
    async readRaw(relativePath: string): Promise<string | null> {
      return null;
    },
    async writeRaw(relativePath: string, content: string): Promise<void> {},
  },
}));

// Mock source-scanner to avoid real git/openclaw operations
vi.mock("../services/source-scanner.js", () => ({
  runScan: vi.fn(async (gitSource: any, openclawConfig: any, options?: any) => {
    const scanId = randomUUID();
    const now = new Date().toISOString();
    const scanRecord = {
      id: scanId,
      gitSourceId: gitSource.id,
      projectId: gitSource.projectId,
      status: "completed",
      branch: options?.branch ?? gitSource.branch,
      commitHash: "mock-commit-hash",
      scannedFiles: ["src/routes.ts"],
      totalFilesFound: 1,
      result: {
        endpointsFound: 2,
        endpointsNew: 2,
        endpointsUpdated: 0,
        endpointsRemoved: 0,
        changes: [],
      },
      error: null,
      openclawRunId: null,
      startedAt: now,
      completedAt: now,
    };
    // Save to mock storage
    getCollection("scan-records").set(scanId, JSON.stringify(scanRecord));
    return { scanRecord, endpoints: [] };
  }),
}));

// Must import after mocks
const { scanRoutes } = await import("../routes/scan.js");

// ── App setup ─────────────────────────────────────────────────────────────────

function createApp() {
  const app = new Hono();
  app.route("/", scanRoutes);
  return app;
}

// ── Test data helpers ─────────────────────────────────────────────────────────

const PROJECT_ID = randomUUID();
const OPENCLAW_CONN_ID = randomUUID();

function seedGitSource(id?: string) {
  const gitSourceId = id ?? randomUUID();
  const gitSource = {
    id: gitSourceId,
    projectId: PROJECT_ID,
    name: "Test Repo",
    repoUrl: "https://github.com/test/repo.git",
    branch: "main",
    auth: { type: "none" },
    scanConfig: {
      includePaths: ["src/**"],
      excludePaths: ["node_modules/**"],
      framework: "auto",
      maxFileSize: 100000,
      maxTotalFiles: 50,
    },
    openclawConnectionId: OPENCLAW_CONN_ID,
    lastScanId: null,
    lastScanAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  getCollection("git-sources").set(gitSourceId, JSON.stringify(gitSource));
  return gitSourceId;
}

function seedProject(projectId?: string) {
  const pid = projectId ?? PROJECT_ID;
  const project = {
    id: pid,
    name: "Test Project",
    openclawConnections: [
      {
        id: OPENCLAW_CONN_ID,
        gatewayUrl: "ws://localhost:4800",
        name: "Local",
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  getCollection("projects").set(pid, JSON.stringify(project));
}

function seedScanRecord(gitSourceId: string, overrides: Record<string, any> = {}) {
  const scanId = overrides.id ?? randomUUID();
  const now = new Date().toISOString();
  const record = {
    id: scanId,
    gitSourceId,
    projectId: PROJECT_ID,
    status: "completed",
    branch: "main",
    commitHash: "abc123",
    scannedFiles: [],
    totalFilesFound: 0,
    result: null,
    error: null,
    openclawRunId: null,
    startedAt: overrides.startedAt ?? now,
    completedAt: now,
    ...overrides,
  };
  getCollection("scan-records").set(scanId, JSON.stringify(record));
  return scanId;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Scan Routes", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    memoryStore.clear();
    app = createApp();
  });

  // ── POST /git-sources/:id/scan ────────────────────────────────────────────

  describe("POST /git-sources/:id/scan", () => {
    it("should trigger scan and return 202 with ScanRecord", async () => {
      const gitSourceId = seedGitSource();
      seedProject();

      // Set env token for OpenClaw
      process.env.OPENCLAW_GATEWAY_TOKEN = "test-token";

      const res = await app.request(`/git-sources/${gitSourceId}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(202);
      const data = await res.json();
      // Should have scan record info
      expect(data.gitSourceId).toBe(gitSourceId);

      delete process.env.OPENCLAW_GATEWAY_TOKEN;
    });

    it("should return 404 for non-existent git source", async () => {
      const fakeId = randomUUID();
      const res = await app.request(`/git-sources/${fakeId}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("不存在");
    });

    it("should return 404 when project doesn't exist", async () => {
      const gitSourceId = seedGitSource();
      // Don't seed project
      process.env.OPENCLAW_GATEWAY_TOKEN = "test-token";

      const res = await app.request(`/git-sources/${gitSourceId}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("项目不存在");

      delete process.env.OPENCLAW_GATEWAY_TOKEN;
    });

    it("should return 400 when OpenClaw token is not configured", async () => {
      const gitSourceId = seedGitSource();
      seedProject();

      // Make sure no token is available
      delete process.env.OPENCLAW_GATEWAY_TOKEN;

      const res = await app.request(`/git-sources/${gitSourceId}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("token");
    });
  });

  // ── GET /scan-records ─────────────────────────────────────────────────────

  describe("GET /scan-records", () => {
    it("should return scan records filtered by gitSourceId", async () => {
      const gitSourceId1 = seedGitSource();
      const gitSourceId2 = seedGitSource();
      seedScanRecord(gitSourceId1);
      seedScanRecord(gitSourceId1);
      seedScanRecord(gitSourceId2);

      const res = await app.request(`/scan-records?gitSourceId=${gitSourceId1}`);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.items).toHaveLength(2);
      expect(data.total).toBe(2);
      for (const item of data.items) {
        expect(item.gitSourceId).toBe(gitSourceId1);
      }
    });

    it("should return 400 when gitSourceId is missing", async () => {
      const res = await app.request("/scan-records");
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("gitSourceId");
    });

    it("should support pagination with limit and offset", async () => {
      const gitSourceId = seedGitSource();
      // Create 5 records with different timestamps
      for (let i = 0; i < 5; i++) {
        const startedAt = new Date(Date.now() - i * 60000).toISOString();
        seedScanRecord(gitSourceId, { startedAt });
      }

      const res = await app.request(`/scan-records?gitSourceId=${gitSourceId}&limit=2&offset=1`);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.items).toHaveLength(2);
      expect(data.total).toBe(5);
      expect(data.limit).toBe(2);
      expect(data.offset).toBe(1);
    });

    it("should sort by startedAt descending", async () => {
      const gitSourceId = seedGitSource();
      const t1 = new Date("2026-01-01T00:00:00.000Z").toISOString();
      const t2 = new Date("2026-06-01T00:00:00.000Z").toISOString();
      const t3 = new Date("2026-03-01T00:00:00.000Z").toISOString();

      seedScanRecord(gitSourceId, { startedAt: t1 });
      seedScanRecord(gitSourceId, { startedAt: t2 });
      seedScanRecord(gitSourceId, { startedAt: t3 });

      const res = await app.request(`/scan-records?gitSourceId=${gitSourceId}`);
      const data = await res.json();

      expect(data.items).toHaveLength(3);
      // Should be sorted newest first
      expect(data.items[0].startedAt).toBe(t2);
      expect(data.items[1].startedAt).toBe(t3);
      expect(data.items[2].startedAt).toBe(t1);
    });

    it("should return empty list when no records match", async () => {
      const res = await app.request(`/scan-records?gitSourceId=${randomUUID()}`);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.items).toHaveLength(0);
      expect(data.total).toBe(0);
    });

    it("should default to limit=20 and offset=0", async () => {
      const gitSourceId = seedGitSource();
      seedScanRecord(gitSourceId);

      const res = await app.request(`/scan-records?gitSourceId=${gitSourceId}`);
      const data = await res.json();

      expect(data.limit).toBe(20);
      expect(data.offset).toBe(0);
    });
  });

  // ── GET /scan-records/:id ─────────────────────────────────────────────────

  describe("GET /scan-records/:id", () => {
    it("should return a single scan record by id", async () => {
      const gitSourceId = seedGitSource();
      const scanId = seedScanRecord(gitSourceId, {
        status: "completed",
        commitHash: "def456",
        result: {
          endpointsFound: 5,
          endpointsNew: 3,
          endpointsUpdated: 1,
          endpointsRemoved: 1,
          changes: [],
        },
      });

      const res = await app.request(`/scan-records/${scanId}`);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.id).toBe(scanId);
      expect(data.gitSourceId).toBe(gitSourceId);
      expect(data.status).toBe("completed");
      expect(data.commitHash).toBe("def456");
      expect(data.result.endpointsFound).toBe(5);
    });

    it("should return 404 for non-existent scan record", async () => {
      const fakeId = randomUUID();
      const res = await app.request(`/scan-records/${fakeId}`);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("不存在");
    });

    it("should return scan record with error info when scan failed", async () => {
      const gitSourceId = seedGitSource();
      const scanId = seedScanRecord(gitSourceId, {
        status: "failed",
        error: "Git clone failed: authentication required",
        result: null,
      });

      const res = await app.request(`/scan-records/${scanId}`);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.status).toBe("failed");
      expect(data.error).toBe("Git clone failed: authentication required");
      expect(data.result).toBeNull();
    });
  });
});
