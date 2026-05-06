/**
 * Tests for API Document Diff Service — 端点变更检测
 */

import { describe, it, expect } from "vitest";
import type { ApiEndpoint, Endpoint } from "@nexqa/shared";
import {
  diffEndpoints,
  detectFieldChanges,
  getEndpointKey,
} from "../services/api-document-diff-service.js";

// ── Helpers ───────────────────────────────────────────

function makeApiEndpoint(overrides: Partial<ApiEndpoint> & { method: string; path: string }): ApiEndpoint {
  return {
    id: overrides.id || crypto.randomUUID(),
    projectId: overrides.projectId || "proj-1",
    documentId: overrides.documentId || "doc-1",
    method: overrides.method as ApiEndpoint["method"],
    path: overrides.path,
    summary: overrides.summary || "",
    headers: overrides.headers || [],
    queryParams: overrides.queryParams || [],
    pathParams: overrides.pathParams || [],
    body: overrides.body,
    responses: overrides.responses || [],
    createdAt: overrides.createdAt || new Date().toISOString(),
    updatedAt: overrides.updatedAt || new Date().toISOString(),
  };
}

function makeEndpoint(overrides: Partial<Endpoint> & { method: string; path: string }): Endpoint {
  return {
    method: overrides.method as Endpoint["method"],
    path: overrides.path,
    summary: overrides.summary || "",
    headers: overrides.headers || [],
    queryParams: overrides.queryParams || [],
    pathParams: overrides.pathParams || [],
    body: overrides.body,
    responses: overrides.responses || [],
    confidence: "high",
  };
}

const mockDoc = {
  id: "doc-1",
  projectId: "proj-1",
  name: "test-api.json",
  format: "openapi3" as const,
  source: null,
  contentHash: "abc123",
  endpointCount: 3,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ── getEndpointKey ────────────────────────────────────

describe("getEndpointKey", () => {
  it("应返回 METHOD PATH 格式", () => {
    expect(getEndpointKey("get", "/pets")).toBe("GET /pets");
    expect(getEndpointKey("POST", "/users/{id}")).toBe("POST /users/{id}");
  });
});

// ── detectFieldChanges ────────────────────────────────

describe("detectFieldChanges", () => {
  it("相同端点应无变更", () => {
    const ep = makeApiEndpoint({ method: "GET", path: "/pets", summary: "list" });
    const incoming = makeEndpoint({ method: "GET", path: "/pets", summary: "list" });
    const changes = detectFieldChanges(ep, incoming);
    expect(changes).toHaveLength(0);
  });

  it("应检测 summary 变更", () => {
    const ep = makeApiEndpoint({ method: "GET", path: "/pets", summary: "old" });
    const incoming = makeEndpoint({ method: "GET", path: "/pets", summary: "new" });
    const changes = detectFieldChanges(ep, incoming);
    expect(changes).toHaveLength(1);
    expect(changes[0].field).toBe("summary");
    expect(changes[0].breaking).toBe(false);
  });

  it("应检测新增必填 queryParam（breaking）", () => {
    const ep = makeApiEndpoint({ method: "GET", path: "/pets" });
    const incoming = makeEndpoint({
      method: "GET",
      path: "/pets",
      queryParams: [{ name: "status", type: "string", required: true, description: "" }],
    });
    const changes = detectFieldChanges(ep, incoming);
    const statusChange = changes.find((c) => c.field === "queryParam.status");
    expect(statusChange).toBeDefined();
    expect(statusChange!.type).toBe("added");
    expect(statusChange!.breaking).toBe(true);
  });

  it("应检测新增可选 queryParam（non-breaking）", () => {
    const ep = makeApiEndpoint({ method: "GET", path: "/pets" });
    const incoming = makeEndpoint({
      method: "GET",
      path: "/pets",
      queryParams: [{ name: "limit", type: "integer", required: false, description: "" }],
    });
    const changes = detectFieldChanges(ep, incoming);
    const limitChange = changes.find((c) => c.field === "queryParam.limit");
    expect(limitChange).toBeDefined();
    expect(limitChange!.breaking).toBe(false);
  });

  it("应检测移除参数", () => {
    const ep = makeApiEndpoint({
      method: "GET",
      path: "/pets",
      queryParams: [{ name: "page", type: "integer", required: false, description: "" }],
    });
    const incoming = makeEndpoint({ method: "GET", path: "/pets" });
    const changes = detectFieldChanges(ep, incoming);
    const pageChange = changes.find((c) => c.field === "queryParam.page");
    expect(pageChange).toBeDefined();
    expect(pageChange!.type).toBe("removed");
  });

  it("应检测参数变为必填（breaking）", () => {
    const ep = makeApiEndpoint({
      method: "GET",
      path: "/pets",
      queryParams: [{ name: "status", type: "string", required: false, description: "" }],
    });
    const incoming = makeEndpoint({
      method: "GET",
      path: "/pets",
      queryParams: [{ name: "status", type: "string", required: true, description: "" }],
    });
    const changes = detectFieldChanges(ep, incoming);
    const statusChange = changes.find((c) => c.field === "queryParam.status");
    expect(statusChange).toBeDefined();
    expect(statusChange!.type).toBe("modified");
    expect(statusChange!.breaking).toBe(true);
  });

  it("应检测新增请求体", () => {
    const ep = makeApiEndpoint({ method: "POST", path: "/pets" });
    const incoming = makeEndpoint({
      method: "POST",
      path: "/pets",
      body: { contentType: "application/json", schema: {} },
    });
    const changes = detectFieldChanges(ep, incoming);
    expect(changes.find((c) => c.field === "body")).toBeDefined();
  });

  it("应检测移除请求体（breaking）", () => {
    const ep = makeApiEndpoint({
      method: "POST",
      path: "/pets",
      body: { contentType: "application/json", schema: {} },
    });
    const incoming = makeEndpoint({ method: "POST", path: "/pets" });
    const changes = detectFieldChanges(ep, incoming);
    const bodyChange = changes.find((c) => c.field === "body");
    expect(bodyChange).toBeDefined();
    expect(bodyChange!.type).toBe("removed");
    expect(bodyChange!.breaking).toBe(true);
  });

  it("应检测响应状态码新增和移除", () => {
    const ep = makeApiEndpoint({
      method: "GET",
      path: "/pets",
      responses: [
        { status: 200, description: "OK" },
        { status: 404, description: "Not Found" },
      ],
    });
    const incoming = makeEndpoint({
      method: "GET",
      path: "/pets",
      responses: [
        { status: 200, description: "OK" },
        { status: 500, description: "Server Error" },
      ],
    });
    const changes = detectFieldChanges(ep, incoming);
    expect(changes.find((c) => c.field === "response.500" && c.type === "added")).toBeDefined();
    expect(changes.find((c) => c.field === "response.404" && c.type === "removed" && c.breaking)).toBeDefined();
  });
});

// ── diffEndpoints ─────────────────────────────────────

describe("diffEndpoints", () => {
  it("相同端点列表应无变更", async () => {
    const existing = [
      makeApiEndpoint({ method: "GET", path: "/pets" }),
      makeApiEndpoint({ method: "POST", path: "/pets" }),
    ];
    const incoming = [
      makeEndpoint({ method: "GET", path: "/pets" }),
      makeEndpoint({ method: "POST", path: "/pets" }),
    ];

    const result = await diffEndpoints(existing, incoming, mockDoc);
    expect(result.summary.added).toBe(0);
    expect(result.summary.removed).toBe(0);
    expect(result.summary.modified).toBe(0);
    expect(result.summary.breaking).toBe(0);
  });

  it("应检测新增端点", async () => {
    const existing = [makeApiEndpoint({ method: "GET", path: "/pets" })];
    const incoming = [
      makeEndpoint({ method: "GET", path: "/pets" }),
      makeEndpoint({ method: "POST", path: "/pets" }),
    ];

    const result = await diffEndpoints(existing, incoming, mockDoc);
    expect(result.summary.added).toBe(1);
    expect(result.added[0].endpoint.method).toBe("POST");
    expect(result.added[0].endpoint.path).toBe("/pets");
    expect(result.added[0].tempId).toBe("temp-POST /pets");
  });

  it("应检测删除端点（breaking）", async () => {
    const existing = [
      makeApiEndpoint({ method: "GET", path: "/pets" }),
      makeApiEndpoint({ method: "DELETE", path: "/pets/{id}" }),
    ];
    const incoming = [makeEndpoint({ method: "GET", path: "/pets" })];

    const result = await diffEndpoints(existing, incoming, mockDoc);
    expect(result.summary.removed).toBe(1);
    expect(result.removed[0].endpoint.method).toBe("DELETE");
    expect(result.summary.breaking).toBeGreaterThanOrEqual(1);
  });

  it("应检测修改端点", async () => {
    const existing = [
      makeApiEndpoint({
        method: "GET",
        path: "/pets",
        summary: "old summary",
      }),
    ];
    const incoming = [
      makeEndpoint({
        method: "GET",
        path: "/pets",
        summary: "new summary",
        queryParams: [{ name: "status", type: "string", required: true, description: "" }],
      }),
    ];

    const result = await diffEndpoints(existing, incoming, mockDoc);
    expect(result.summary.modified).toBe(1);
    expect(result.modified[0].endpointId).toBe(existing[0].id);
    expect(result.modified[0].severity).toBe("breaking");

    // 应有 summary 变更 + 新增 required queryParam
    expect(result.modified[0].changes.length).toBeGreaterThanOrEqual(2);
  });

  it("应正确填充 documentId 和 documentName", async () => {
    const result = await diffEndpoints([], [], mockDoc);
    expect(result.documentId).toBe("doc-1");
    expect(result.documentName).toBe("test-api.json");
  });

  it("应处理空列表", async () => {
    const result = await diffEndpoints([], [], mockDoc);
    expect(result.summary.added).toBe(0);
    expect(result.summary.removed).toBe(0);
    expect(result.summary.modified).toBe(0);
  });

  it("应计算 breaking 数量 = breaking modified + removed", async () => {
    const existing = [
      makeApiEndpoint({ id: "ep-1", method: "GET", path: "/pets" }),
      makeApiEndpoint({ id: "ep-2", method: "DELETE", path: "/pets/{id}" }),
    ];
    const incoming = [
      makeEndpoint({
        method: "GET",
        path: "/pets",
        queryParams: [{ name: "required-param", type: "string", required: true, description: "" }],
      }),
      // DELETE /pets/{id} removed
    ];

    const result = await diffEndpoints(existing, incoming, mockDoc);
    // 1 removed (breaking) + 1 modified with breaking change
    expect(result.summary.breaking).toBe(2);
  });
});
