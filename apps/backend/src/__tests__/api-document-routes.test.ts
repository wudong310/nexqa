/**
 * Integration tests for API Document routes
 * Tests the full request/response cycle for api-documents endpoints
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock storage path for isolation
let testDataDir: string;
const originalEnv = process.env;

// Sample test data
const sampleOpenApi3 = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Test API", version: "1.0.0" },
  paths: {
    "/pets": {
      get: {
        summary: "List pets",
        responses: { "200": { description: "OK" } },
      },
      post: {
        summary: "Create pet",
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { name: { type: "string" } } },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/pets/{id}": {
      get: {
        summary: "Get pet by ID",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
  },
});

const sampleSwagger2 = JSON.stringify({
  swagger: "2.0",
  info: { title: "Swagger API", version: "1.0.0" },
  paths: {
    "/users": {
      get: {
        summary: "List users",
        responses: { "200": { description: "OK" } },
      },
    },
  },
});

const samplePostman = JSON.stringify({
  info: { name: "Test Collection", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
  item: [
    {
      name: "Get Products",
      request: { method: "GET", url: { raw: "https://api.example.com/products" } },
    },
  ],
});

const sampleHAR = JSON.stringify({
  log: {
    version: "1.2",
    entries: [
      {
        request: {
          method: "GET",
          url: "https://api.example.com/orders",
        },
      },
    ],
  },
});

const invalidContent = "This is not a valid API document";

// Helper to create test app
async function createTestApp() {
  // Dynamically import after setting env
  const { apiDocumentRoutes } = await import("../routes/api-documents.js");
  const app = new Hono();
  app.route("/api-documents", apiDocumentRoutes);
  return app;
}

// ── Tests ─────────────────────────────────────────────

describe("API Documents Routes", () => {
  let app: Hono;

  beforeAll(async () => {
    // Create temp directory for test data
    testDataDir = join(tmpdir(), `nexqa-test-${Date.now()}`);
    await mkdir(join(testDataDir, "api-documents"), { recursive: true });
    await mkdir(join(testDataDir, "api-endpoints"), { recursive: true });
    await mkdir(join(testDataDir, "test-cases"), { recursive: true });
    
    // Mock settings
    await writeFile(
      join(testDataDir, "settings.json"),
      JSON.stringify({ storage: { dataDir: testDataDir } })
    );
    
    // Set env to use test data dir
    process.env.NEXQA_DATA_DIR = testDataDir;
    
    app = await createTestApp();
  });

  afterAll(async () => {
    // Cleanup
    process.env = originalEnv;
    await rm(testDataDir, { recursive: true, force: true });
  });

  // ── GET /api-documents ─────────────────────────────

  describe("GET /api-documents", () => {
    it("应返回指定项目的文档列表", async () => {
      const projectId = randomUUID();
      const res = await app.request(`/api-documents?projectId=${projectId}`);
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data).toHaveProperty("data");
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("缺少 projectId 应返回 400 错误", async () => {
      const res = await app.request("/api-documents");
      expect(res.status).toBe(400);
      
      const data = await res.json();
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("projectId");
    });
  });

  // ── POST /api-documents/import ─────────────────────

  describe("POST /api-documents/import", () => {
    const projectId = randomUUID();

    it("应成功导入 OpenAPI 3.x 文档", async () => {
      const res = await app.request("/api-documents/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "test-openapi3.json",
          content: sampleOpenApi3,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data).toHaveProperty("isUpdate", false);
      expect(data).toHaveProperty("document");
      expect(data).toHaveProperty("endpoints");
      expect(data).toHaveProperty("parseResult");
      
      expect(data.document.name).toBe("test-openapi3.json");
      expect(data.document.format).toBe("openapi3");
      expect(data.parseResult.format).toBe("openapi3");
      expect(data.parseResult.endpointCount).toBe(3);
      expect(data.endpoints).toHaveLength(3);
    });

    it("应成功导入 Swagger 2.0 文档", async () => {
      const res = await app.request("/api-documents/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "test-swagger2.json",
          content: sampleSwagger2,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.document.format).toBe("swagger2");
      expect(data.parseResult.endpointCount).toBe(1);
    });

    it("应成功导入 Postman Collection 文档", async () => {
      const res = await app.request("/api-documents/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "test-postman.json",
          content: samplePostman,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.document.format).toBe("postman-v2");
      expect(data.parseResult.endpointCount).toBe(1);
    });

    it("应成功导入 HAR 文档", async () => {
      const res = await app.request("/api-documents/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "test-har.json",
          content: sampleHAR,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      
      expect(data.document.format).toBe("har");
      expect(data.parseResult.endpointCount).toBe(1);
    });

    it("不支持的格式应返回 400 错误", async () => {
      const res = await app.request("/api-documents/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          content: invalidContent,
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });

    it("缺少 content 应返回 400 错误", async () => {
      const res = await app.request("/api-documents/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("content");
    });

    it("空 content 应返回 400 错误", async () => {
      const res = await app.request("/api-documents/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          content: "",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("缺少 projectId 应返回 400 错误", async () => {
      const res = await app.request("/api-documents/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: sampleOpenApi3 }),
      });

      expect(res.status).toBe(400);
    });
  });

  // ── GET /api-documents/:id ────────────────────────

  describe("GET /api-documents/:id", () => {
    it("应返回文档详情及端点列表", async () => {
      const projectId = randomUUID();
      
      // First import a document
      const importRes = await app.request("/api-documents/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "detail-test.json",
          content: sampleOpenApi3,
        }),
      });
      
      const importData = await importRes.json();
      const docId = importData.document.id;

      // Then get the document
      const res = await app.request(`/api-documents/${docId}`);
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data).toHaveProperty("document");
      expect(data).toHaveProperty("endpoints");
      expect(data.document.id).toBe(docId);
      expect(Array.isArray(data.endpoints)).toBe(true);
      expect(data.endpoints.length).toBe(3);
      
      // Each endpoint should have testCaseCount
      for (const ep of data.endpoints) {
        expect(ep).toHaveProperty("testCaseCount");
        expect(typeof ep.testCaseCount).toBe("number");
      }
    });

    it("不存在的文档应返回 404", async () => {
      const fakeId = randomUUID();
      const res = await app.request(`/api-documents/${fakeId}`);
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /api-documents/:id ─────────────────────

  describe("DELETE /api-documents/:id", () => {
    it("应删除文档及其端点", async () => {
      const projectId = randomUUID();
      
      // Import
      const importRes = await app.request("/api-documents/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "delete-test.json",
          content: sampleOpenApi3,
        }),
      });
      
      const importData = await importRes.json();
      const docId = importData.document.id;

      // Delete
      const deleteRes = await app.request(`/api-documents/${docId}`, {
        method: "DELETE",
      });
      
      expect(deleteRes.status).toBe(200);
      const deleteData = await deleteRes.json();
      expect(deleteData.success).toBe(true);
      expect(deleteData.deletedEndpoints.length).toBe(3);

      // Verify deleted
      const getRes = await app.request(`/api-documents/${docId}`);
      expect(getRes.status).toBe(404);
    });

    it("删除不存在的文档应返回错误", async () => {
      const fakeId = randomUUID();
      const res = await app.request(`/api-documents/${fakeId}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(400);
    });
  });

  // ── POST /api-documents/:id/confirm-update ───────

  describe("POST /api-documents/:id/confirm-update", () => {
    it("确认更新需要 content 字段", async () => {
      const projectId = randomUUID();
      
      // Import initial document
      const importRes = await app.request("/api-documents/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: "confirm-test.json",
          content: sampleOpenApi3,
        }),
      });
      
      const importData = await importRes.json();
      const docId = importData.document.id;

      // Modified content (added endpoint)
      const modifiedContent = JSON.stringify({
        openapi: "3.0.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/pets": {
            get: { summary: "List pets", responses: { "200": { description: "OK" } } },
          },
          "/users": {
            get: { summary: "List users", responses: { "200": { description: "OK" } } },
          },
        },
      });

      // Import with updateDocumentId to get diff
      const updateRes = await app.request("/api-documents/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          content: modifiedContent,
          updateDocumentId: docId,
        }),
      });

      const updateData = await updateRes.json();
      
      // This should be an update
      if (updateData.isUpdate && updateData.diff) {
        // Try confirm without content - should fail
        const confirmResWithoutContent = await app.request(`/api-documents/${docId}/confirm-update`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentHash: updateData.document.contentHash,
            acceptAdded: updateData.diff.added.map((a: { tempId: string }) => a.tempId),
            acceptModified: [],
            acceptRemoved: [],
          }),
        });

        // Should return 400 because content is missing
        expect(confirmResWithoutContent.status).toBe(400);
      }
    });

    it("确认更新需要 contentHash 字段", async () => {
      const fakeId = randomUUID();
      
      const res = await app.request(`/api-documents/${fakeId}/confirm-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "{}",
          acceptAdded: [],
          acceptModified: [],
          acceptRemoved: [],
        }),
      });

      expect(res.status).toBe(400);
    });
  });
});

// ── Diff Service Tests ──────────────────────────────

describe("API Document Diff Service", () => {
  it("应正确检测新增端点", async () => {
    const { diffEndpoints } = await import("../services/api-document-diff-service.js");
    
    const existing: never[] = [];
    const incoming = [
      {
        method: "GET" as const,
        path: "/pets",
        summary: "List pets",
        headers: [],
        queryParams: [],
        pathParams: [],
        responses: [],
        confidence: "high" as const,
      },
    ];
    
    const doc = {
      id: "doc-1",
      projectId: "proj-1",
      name: "test.json",
      format: "openapi3" as const,
      source: null,
      contentHash: "abc",
      endpointCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    const result = await diffEndpoints(existing, incoming, doc);
    
    expect(result.summary.added).toBe(1);
    expect(result.summary.removed).toBe(0);
    expect(result.summary.modified).toBe(0);
    expect(result.added[0].endpoint.path).toBe("/pets");
  });

  it("应正确检测删除端点", async () => {
    const { diffEndpoints } = await import("../services/api-document-diff-service.js");
    
    const existing = [
      {
        id: "ep-1",
        projectId: "proj-1",
        documentId: "doc-1",
        method: "GET" as const,
        path: "/pets",
        summary: "List pets",
        headers: [],
        queryParams: [],
        pathParams: [],
        responses: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    
    const incoming: never[] = [];
    
    const doc = {
      id: "doc-1",
      projectId: "proj-1",
      name: "test.json",
      format: "openapi3" as const,
      source: null,
      contentHash: "abc",
      endpointCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    const result = await diffEndpoints(existing, incoming, doc);
    
    expect(result.summary.added).toBe(0);
    expect(result.summary.removed).toBe(1);
    expect(result.summary.breaking).toBe(1); // Removed is breaking
    expect(result.removed[0].endpoint.path).toBe("/pets");
  });

  it("应正确检测修改端点（breaking change）", async () => {
    const { diffEndpoints } = await import("../services/api-document-diff-service.js");
    
    const existing = [
      {
        id: "ep-1",
        projectId: "proj-1",
        documentId: "doc-1",
        method: "GET" as const,
        path: "/pets",
        summary: "List pets",
        headers: [],
        queryParams: [],
        pathParams: [],
        responses: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    
    const incoming = [
      {
        method: "GET" as const,
        path: "/pets",
        summary: "List pets",
        headers: [],
        queryParams: [
          { name: "status", type: "string", required: true, description: "Filter by status" },
        ],
        pathParams: [],
        responses: [],
        confidence: "high" as const,
      },
    ];
    
    const doc = {
      id: "doc-1",
      projectId: "proj-1",
      name: "test.json",
      format: "openapi3" as const,
      source: null,
      contentHash: "abc",
      endpointCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    const result = await diffEndpoints(existing, incoming, doc);
    
    expect(result.summary.modified).toBe(1);
    expect(result.modified[0].severity).toBe("breaking"); // Added required param is breaking
    expect(result.modified[0].changes.some(c => c.breaking)).toBe(true);
  });

  it("应正确检测修改端点（non-breaking change）", async () => {
    const { diffEndpoints } = await import("../services/api-document-diff-service.js");
    
    const existing = [
      {
        id: "ep-1",
        projectId: "proj-1",
        documentId: "doc-1",
        method: "GET" as const,
        path: "/pets",
        summary: "List pets",
        headers: [],
        queryParams: [],
        pathParams: [],
        responses: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    
    const incoming = [
      {
        method: "GET" as const,
        path: "/pets",
        summary: "List all pets", // Summary changed
        headers: [],
        queryParams: [
          { name: "limit", type: "integer", required: false, description: "Limit results" },
        ],
        pathParams: [],
        responses: [],
        confidence: "high" as const,
      },
    ];
    
    const doc = {
      id: "doc-1",
      projectId: "proj-1",
      name: "test.json",
      format: "openapi3" as const,
      source: null,
      contentHash: "abc",
      endpointCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    const result = await diffEndpoints(existing, incoming, doc);
    
    expect(result.summary.modified).toBe(1);
    expect(result.modified[0].severity).toBe("non-breaking"); // Optional param is not breaking
  });
});
