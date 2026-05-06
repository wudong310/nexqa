/**
 * API Importer 集成测试
 *
 * 覆盖：
 * - 全新导入（空库 → 导入 N 个 endpoint → 验证 added 数量）
 * - 增量更新（已有数据 → 新扫描有变更 → 验证 updated + changedFields）
 * - 删除检测（已有端点在新扫描中消失 → 验证 removed 列表）
 * - 无变更（相同数据重复导入 → unchanged）
 * - 变更标记（apiChangeFlag 正确设置到关联 test-case）
 *
 * 使用 vi.mock 隔离 storage 层为内存 Map，不做真实数据库调用
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import type { Endpoint } from "@nexqa/shared";

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

// Must import after mock setup
const { importEndpoints } = await import("../services/api-importer.js");

// ── Helpers ───────────────────────────────────────────────────────────────────

const PROJECT_ID = randomUUID();
const GIT_SOURCE_ID = randomUUID();
const SCAN_ID = randomUUID();

function makeEndpoint(overrides: Partial<Endpoint> = {}): Endpoint {
  return {
    method: "GET",
    path: "/api/users",
    summary: "List users",
    headers: [],
    queryParams: [],
    pathParams: [],
    responses: [{ status: 200, description: "OK" }],
    ...overrides,
  };
}

function makeImportOptions(overrides = {}) {
  return {
    projectId: PROJECT_ID,
    gitSourceId: GIT_SOURCE_ID,
    scanId: SCAN_ID,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("importEndpoints", () => {
  beforeEach(() => {
    // Clear all collections
    memoryStore.clear();
  });

  describe("全新导入", () => {
    it("should create all endpoints when storage is empty", async () => {
      const endpoints: Endpoint[] = [
        makeEndpoint({ method: "GET", path: "/api/users", summary: "List users" }),
        makeEndpoint({ method: "POST", path: "/api/users", summary: "Create user" }),
        makeEndpoint({ method: "GET", path: "/api/items", summary: "List items" }),
      ];

      const result = await importEndpoints(endpoints, makeImportOptions());

      expect(result.added).toHaveLength(3);
      expect(result.updated).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
      expect(result.unchanged).toBe(0);
      expect(result.changes).toHaveLength(3);

      // Verify all changes are 'added' type
      for (const change of result.changes) {
        expect(change.type).toBe("added");
      }

      // Verify endpoints stored correctly
      const stored = await getCollection("api-endpoints");
      expect(stored.size).toBe(3);
    });

    it("should generate UUIDs and timestamps for new endpoints", async () => {
      const endpoints: Endpoint[] = [
        makeEndpoint({ method: "GET", path: "/api/health" }),
      ];

      const result = await importEndpoints(endpoints, makeImportOptions());

      expect(result.added).toHaveLength(1);
      const ep = result.added[0];
      expect(ep.id).toBeDefined();
      expect(ep.projectId).toBe(PROJECT_ID);
      expect(ep.gitSourceId).toBe(GIT_SOURCE_ID);
      expect(ep.lastScanId).toBe(SCAN_ID);
      expect(ep.sourceType).toBe("git-scan");
      expect(ep.createdAt).toBeDefined();
      expect(ep.updatedAt).toBeDefined();
    });

    it("should create correct change records", async () => {
      const endpoints: Endpoint[] = [
        makeEndpoint({ method: "POST", path: "/api/orders", summary: "Create order" }),
      ];

      const result = await importEndpoints(endpoints, makeImportOptions());

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]).toMatchObject({
        type: "added",
        method: "POST",
        path: "/api/orders",
        summary: "Create order",
      });
      expect(result.changes[0].endpointId).toBeDefined();
    });
  });

  describe("增量更新", () => {
    it("should detect and update changed endpoints", async () => {
      // First import
      const v1: Endpoint[] = [
        makeEndpoint({
          method: "GET",
          path: "/api/users",
          summary: "List users",
          queryParams: [{ name: "page", type: "number", required: false, description: "Page number" }],
        }),
      ];
      await importEndpoints(v1, makeImportOptions());

      // Second import with changes
      const v2: Endpoint[] = [
        makeEndpoint({
          method: "GET",
          path: "/api/users",
          summary: "List all users",  // changed summary
          queryParams: [
            { name: "page", type: "number", required: false, description: "Page number" },
            { name: "limit", type: "number", required: false, description: "Page size" },  // added param
          ],
        }),
      ];

      const result = await importEndpoints(v2, makeImportOptions({ scanId: randomUUID() }));

      expect(result.added).toHaveLength(0);
      expect(result.updated).toHaveLength(1);
      expect(result.removed).toHaveLength(0);
      expect(result.unchanged).toBe(0);

      // Check change details
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].type).toBe("updated");
      expect(result.changes[0].fields).toBeDefined();
      expect(result.changes[0].fields!.length).toBeGreaterThan(0);

      // Verify specific field changes
      const fieldNames = result.changes[0].fields!.map((f) => f.field);
      expect(fieldNames).toContain("summary");
      expect(fieldNames).toContain("queryParams");
    });

    it("should detect body changes", async () => {
      const v1: Endpoint[] = [
        makeEndpoint({
          method: "POST",
          path: "/api/users",
          body: { contentType: "application/json", schema: { name: "string" } },
        }),
      ];
      await importEndpoints(v1, makeImportOptions());

      const v2: Endpoint[] = [
        makeEndpoint({
          method: "POST",
          path: "/api/users",
          body: { contentType: "application/json", schema: { name: "string", email: "string" } },
        }),
      ];

      const result = await importEndpoints(v2, makeImportOptions({ scanId: randomUUID() }));

      expect(result.updated).toHaveLength(1);
      const fieldNames = result.changes[0].fields!.map((f) => f.field);
      expect(fieldNames).toContain("body");
    });

    it("should detect response changes", async () => {
      const v1: Endpoint[] = [
        makeEndpoint({
          method: "GET",
          path: "/api/users",
          responses: [{ status: 200, description: "OK" }],
        }),
      ];
      await importEndpoints(v1, makeImportOptions());

      const v2: Endpoint[] = [
        makeEndpoint({
          method: "GET",
          path: "/api/users",
          responses: [
            { status: 200, description: "OK" },
            { status: 404, description: "Not found" },
          ],
        }),
      ];

      const result = await importEndpoints(v2, makeImportOptions({ scanId: randomUUID() }));

      expect(result.updated).toHaveLength(1);
      const fieldNames = result.changes[0].fields!.map((f) => f.field);
      expect(fieldNames).toContain("responses");
    });

    it("should detect header changes", async () => {
      const v1: Endpoint[] = [
        makeEndpoint({
          method: "GET",
          path: "/api/users",
          headers: [{ name: "Authorization", type: "string", required: true, description: "Bearer token" }],
        }),
      ];
      await importEndpoints(v1, makeImportOptions());

      const v2: Endpoint[] = [
        makeEndpoint({
          method: "GET",
          path: "/api/users",
          headers: [
            { name: "Authorization", type: "string", required: true, description: "Bearer token" },
            { name: "X-Request-Id", type: "string", required: false, description: "Trace ID" },
          ],
        }),
      ];

      const result = await importEndpoints(v2, makeImportOptions({ scanId: randomUUID() }));

      expect(result.updated).toHaveLength(1);
      const fieldNames = result.changes[0].fields!.map((f) => f.field);
      expect(fieldNames).toContain("headers");
    });
  });

  describe("删除检测", () => {
    it("should detect removed endpoints", async () => {
      // Import 3 endpoints
      const v1: Endpoint[] = [
        makeEndpoint({ method: "GET", path: "/api/users" }),
        makeEndpoint({ method: "POST", path: "/api/users" }),
        makeEndpoint({ method: "DELETE", path: "/api/users/:id" }),
      ];
      await importEndpoints(v1, makeImportOptions());

      // Re-import with only 1 endpoint (2 removed)
      const v2: Endpoint[] = [
        makeEndpoint({ method: "GET", path: "/api/users" }),
      ];

      const result = await importEndpoints(v2, makeImportOptions({ scanId: randomUUID() }));

      expect(result.removed).toHaveLength(2);
      expect(result.unchanged).toBe(1);

      // Verify removed changes
      const removedChanges = result.changes.filter((c) => c.type === "removed");
      expect(removedChanges).toHaveLength(2);
      const removedPaths = removedChanges.map((c) => `${c.method} ${c.path}`);
      expect(removedPaths).toContain("POST /api/users");
      expect(removedPaths).toContain("DELETE /api/users/:id");
    });

    it("should not physically remove endpoints by default", async () => {
      const v1: Endpoint[] = [
        makeEndpoint({ method: "GET", path: "/api/users" }),
        makeEndpoint({ method: "POST", path: "/api/users" }),
      ];
      await importEndpoints(v1, makeImportOptions());

      // Import with only GET
      const v2: Endpoint[] = [
        makeEndpoint({ method: "GET", path: "/api/users" }),
      ];
      await importEndpoints(v2, makeImportOptions({ scanId: randomUUID() }));

      // POST endpoint should still be in storage (not physically removed)
      const stored = getCollection("api-endpoints");
      expect(stored.size).toBe(2);
    });

    it("should physically remove endpoints when autoRemove is true", async () => {
      const v1: Endpoint[] = [
        makeEndpoint({ method: "GET", path: "/api/users" }),
        makeEndpoint({ method: "POST", path: "/api/users" }),
      ];
      await importEndpoints(v1, makeImportOptions());

      const v2: Endpoint[] = [
        makeEndpoint({ method: "GET", path: "/api/users" }),
      ];
      await importEndpoints(v2, makeImportOptions({
        scanId: randomUUID(),
        autoRemove: true,
      }));

      const stored = getCollection("api-endpoints");
      expect(stored.size).toBe(1);
    });
  });

  describe("无变更", () => {
    it("should count unchanged when same data is re-imported", async () => {
      const endpoints: Endpoint[] = [
        makeEndpoint({
          method: "GET",
          path: "/api/users",
          summary: "List users",
          queryParams: [],
          pathParams: [],
          headers: [],
          responses: [{ status: 200, description: "OK" }],
        }),
        makeEndpoint({
          method: "POST",
          path: "/api/users",
          summary: "Create user",
          queryParams: [],
          pathParams: [],
          headers: [],
          responses: [{ status: 201, description: "Created" }],
        }),
      ];

      // First import
      await importEndpoints(endpoints, makeImportOptions());

      // Same import again
      const result = await importEndpoints(endpoints, makeImportOptions({ scanId: randomUUID() }));

      expect(result.added).toHaveLength(0);
      expect(result.updated).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
      expect(result.unchanged).toBe(2);
      expect(result.changes).toHaveLength(0);
    });

    it("should update lastScanId even for unchanged endpoints", async () => {
      const endpoints: Endpoint[] = [
        makeEndpoint({ method: "GET", path: "/api/health" }),
      ];
      const opts1 = makeImportOptions({ scanId: "scan-1" });
      await importEndpoints(endpoints, opts1 as any);

      const newScanId = randomUUID();
      const opts2 = makeImportOptions({ scanId: newScanId });
      await importEndpoints(endpoints, opts2);

      // Verify lastScanId was updated
      const stored = Array.from(getCollection("api-endpoints").values());
      const ep = JSON.parse(stored[0]);
      expect(ep.lastScanId).toBe(newScanId);
    });
  });

  describe("变更标记 (apiChangeFlag)", () => {
    it("should set apiChangeFlag on related test cases when endpoint is updated", async () => {
      // First import
      const endpoints: Endpoint[] = [
        makeEndpoint({ method: "GET", path: "/api/users", summary: "List" }),
      ];
      const result1 = await importEndpoints(endpoints, makeImportOptions());
      const endpointId = result1.added[0].id;

      // Create a test case linked to this endpoint
      const tcId = randomUUID();
      const testCase = {
        id: tcId,
        endpointId,
        name: "Test list users",
        request: { method: "GET", path: "/api/users", headers: {}, query: {}, timeout: 30000 },
        expected: { status: 200, bodyContains: null, bodySchema: null },
        tags: { purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      getCollection("test-cases").set(tcId, JSON.stringify(testCase));

      // Re-import with changes
      const v2: Endpoint[] = [
        makeEndpoint({ method: "GET", path: "/api/users", summary: "List all users" }),
      ];
      await importEndpoints(v2, makeImportOptions({ scanId: randomUUID() }));

      // Verify test case has apiChangeFlag set
      const raw = getCollection("test-cases").get(tcId);
      expect(raw).toBeDefined();
      const updated = JSON.parse(raw!);
      expect(updated.apiChangeFlag).toBeDefined();
      expect(updated.apiChangeFlag.changeType).toBe("modified");
      expect(updated.apiChangeFlag.changes).toBeDefined();
      expect(updated.apiChangeFlag.changes.length).toBeGreaterThan(0);
    });

    it("should set apiChangeFlag with 'deleted' type when endpoint is removed", async () => {
      // Import
      const endpoints: Endpoint[] = [
        makeEndpoint({ method: "DELETE", path: "/api/items/:id", summary: "Delete item" }),
      ];
      const result1 = await importEndpoints(endpoints, makeImportOptions());
      const endpointId = result1.added[0].id;

      // Create a test case linked to this endpoint
      const tcId = randomUUID();
      const testCase = {
        id: tcId,
        endpointId,
        name: "Test delete item",
        request: { method: "DELETE", path: "/api/items/123", headers: {}, query: {}, timeout: 30000 },
        expected: { status: 200, bodyContains: null, bodySchema: null },
        tags: { purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      getCollection("test-cases").set(tcId, JSON.stringify(testCase));

      // Re-import without that endpoint (it's removed)
      const v2: Endpoint[] = [];
      await importEndpoints(v2, makeImportOptions({ scanId: randomUUID() }));

      const raw = getCollection("test-cases").get(tcId);
      const updated = JSON.parse(raw!);
      expect(updated.apiChangeFlag).toBeDefined();
      expect(updated.apiChangeFlag.changeType).toBe("deleted");
    });

    it("should not modify test cases unrelated to changed endpoints", async () => {
      // Import two endpoints
      const endpoints: Endpoint[] = [
        makeEndpoint({ method: "GET", path: "/api/users" }),
        makeEndpoint({ method: "GET", path: "/api/items" }),
      ];
      const result1 = await importEndpoints(endpoints, makeImportOptions());

      // Create test case linked to /api/items
      const tcId = randomUUID();
      const now = new Date().toISOString();
      const testCase = {
        id: tcId,
        endpointId: result1.added[1].id,  // linked to /api/items
        name: "Test list items",
        request: { method: "GET", path: "/api/items", headers: {}, query: {}, timeout: 30000 },
        expected: { status: 200, bodyContains: null, bodySchema: null },
        tags: { purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" },
        createdAt: now,
        updatedAt: now,
      };
      getCollection("test-cases").set(tcId, JSON.stringify(testCase));

      // Re-import with /api/users changed, /api/items unchanged
      const v2: Endpoint[] = [
        makeEndpoint({ method: "GET", path: "/api/users", summary: "Updated summary" }),
        makeEndpoint({ method: "GET", path: "/api/items" }),
      ];
      await importEndpoints(v2, makeImportOptions({ scanId: randomUUID() }));

      // Test case for /api/items should NOT have apiChangeFlag
      const raw = getCollection("test-cases").get(tcId);
      const tc = JSON.parse(raw!);
      expect(tc.apiChangeFlag).toBeUndefined();
    });
  });

  describe("method+path normalization", () => {
    it("should match endpoints by uppercase method + path", async () => {
      const v1: Endpoint[] = [
        makeEndpoint({ method: "GET", path: "/api/users" }),
      ];
      await importEndpoints(v1, makeImportOptions());

      // Same endpoint, same key → unchanged
      const v2: Endpoint[] = [
        makeEndpoint({ method: "GET", path: "/api/users" }),
      ];
      const result = await importEndpoints(v2, makeImportOptions({ scanId: randomUUID() }));
      expect(result.unchanged).toBe(1);
    });
  });

  describe("mixed operations", () => {
    it("should handle add + update + remove + unchanged in one import", async () => {
      // Initial import
      const v1: Endpoint[] = [
        makeEndpoint({ method: "GET", path: "/api/users", summary: "List users" }),
        makeEndpoint({ method: "POST", path: "/api/users", summary: "Create user" }),
        makeEndpoint({ method: "DELETE", path: "/api/users/:id", summary: "Delete user" }),
        makeEndpoint({ method: "GET", path: "/api/health", summary: "Health check" }),
      ];
      await importEndpoints(v1, makeImportOptions());

      // Second import:
      // - GET /api/users: unchanged
      // - POST /api/users: updated (summary changed)
      // - DELETE /api/users/:id: removed (not in v2)
      // - GET /api/health: unchanged
      // - PUT /api/users/:id: added (new)
      const v2: Endpoint[] = [
        makeEndpoint({ method: "GET", path: "/api/users", summary: "List users" }),
        makeEndpoint({ method: "POST", path: "/api/users", summary: "Create new user" }),
        makeEndpoint({ method: "GET", path: "/api/health", summary: "Health check" }),
        makeEndpoint({ method: "PUT", path: "/api/users/:id", summary: "Update user" }),
      ];

      const result = await importEndpoints(v2, makeImportOptions({ scanId: randomUUID() }));

      expect(result.added).toHaveLength(1);
      expect(result.updated).toHaveLength(1);
      expect(result.removed).toHaveLength(1);
      expect(result.unchanged).toBe(2);

      // Verify change types
      const changeTypes = result.changes.map((c) => c.type);
      expect(changeTypes).toContain("added");
      expect(changeTypes).toContain("updated");
      expect(changeTypes).toContain("removed");
    });
  });

  describe("project/gitSource isolation", () => {
    it("should only match endpoints belonging to same gitSourceId + projectId", async () => {
      // Import under GIT_SOURCE_ID
      const v1: Endpoint[] = [
        makeEndpoint({ method: "GET", path: "/api/users" }),
      ];
      await importEndpoints(v1, makeImportOptions());

      // Import under a different gitSourceId
      const otherGitSourceId = randomUUID();
      const v2: Endpoint[] = [
        makeEndpoint({ method: "GET", path: "/api/users", summary: "Different source" }),
      ];
      const result = await importEndpoints(v2, makeImportOptions({
        gitSourceId: otherGitSourceId,
        scanId: randomUUID(),
      }));

      // Should be added (not matched to existing), since gitSourceId differs
      expect(result.added).toHaveLength(1);
      expect(result.unchanged).toBe(0);
    });
  });
});
