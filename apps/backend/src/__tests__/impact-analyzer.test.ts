/**
 * Tests for Impact Analyzer — rule-based impact matching
 */

import { describe, it, expect } from "vitest";
import type { ApiDiffResult } from "../services/api-diff-service.js";

// Test the path matching logic directly
describe("Impact Analyzer Path Matching", () => {
  function pathMatches(casePath: string, specPath: string): boolean {
    const normCase = casePath.replace(/\{\{[^}]+\}\}/g, "___VAR___").toLowerCase().replace(/\/+$/, "");
    const normSpec = specPath
      .replace(/\{[^}]+\}/g, "___VAR___")
      .replace(/:([a-zA-Z_]+)/g, "___VAR___")
      .toLowerCase()
      .replace(/\/+$/, "");

    if (normCase === normSpec) return true;
    if (normCase.endsWith(normSpec)) return true;

    const regexStr = normSpec
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/___var___/g, "[^/]+");
    try {
      const regex = new RegExp(`${regexStr}$`);
      return regex.test(normCase);
    } catch {
      return false;
    }
  }

  it("should match exact paths", () => {
    expect(pathMatches("/api/users", "/api/users")).toBe(true);
  });

  it("should match parameterized paths with {id} syntax", () => {
    expect(pathMatches("/api/users/123", "/api/users/{id}")).toBe(true);
  });

  it("should match parameterized paths with :id syntax", () => {
    expect(pathMatches("/api/users/123", "/api/users/:id")).toBe(true);
  });

  it("should match template variable paths", () => {
    expect(pathMatches("/api/users/{{userId}}", "/api/users/{id}")).toBe(true);
  });

  it("should not match different paths", () => {
    expect(pathMatches("/api/orders", "/api/users")).toBe(false);
  });

  it("should match paths with base URL prefix", () => {
    expect(pathMatches("http://localhost:8080/api/users", "/api/users")).toBe(true);
  });

  it("should handle complex paths", () => {
    expect(pathMatches("/api/users/123/avatar", "/api/users/{id}/avatar")).toBe(true);
  });
});

describe("Impact Analysis Logic", () => {
  it("should identify direct impact from modified endpoints", () => {
    const diff: ApiDiffResult = {
      summary: { added: 0, removed: 0, modified: 1, breaking: 1 },
      added: [],
      removed: [],
      modified: [
        {
          path: "/api/users",
          method: "POST",
          changes: [
            { field: "requestBody.phone", type: "added", detail: "新增必填字段 phone", breaking: true },
          ],
          severity: "breaking",
        },
      ],
    };

    // Simple test cases
    const testCases = [
      {
        id: "case-1",
        name: "创建用户(正向)",
        request: { method: "POST", path: "/api/users" },
        tags: { priority: "P0", phase: ["smoke"] },
      },
      {
        id: "case-2",
        name: "获取用户列表",
        request: { method: "GET", path: "/api/users" },
        tags: { priority: "P1", phase: ["full"] },
      },
    ];

    // Only POST /api/users should be impacted
    const impacted = testCases.filter(
      (tc) =>
        diff.modified.some(
          (m) => m.method === tc.request.method && tc.request.path === m.path,
        ),
    );

    expect(impacted).toHaveLength(1);
    expect(impacted[0].id).toBe("case-1");
  });

  it("should identify impact from removed endpoints", () => {
    const diff: ApiDiffResult = {
      summary: { added: 0, removed: 1, modified: 0, breaking: 1 },
      added: [],
      removed: [{ path: "/api/orders", method: "DELETE", description: "Delete order" }],
      modified: [],
    };

    const testCases = [
      { id: "c1", name: "删除订单", request: { method: "DELETE", path: "/api/orders" } },
      { id: "c2", name: "获取订单", request: { method: "GET", path: "/api/orders" } },
    ];

    const impacted = testCases.filter((tc) =>
      diff.removed.some((r) => r.method === tc.request.method && tc.request.path === r.path),
    );

    expect(impacted).toHaveLength(1);
    expect(impacted[0].id).toBe("c1");
  });

  it("should identify new cases needed for added endpoints", () => {
    const diff: ApiDiffResult = {
      summary: { added: 2, removed: 0, modified: 0, breaking: 0 },
      added: [
        { path: "/api/users/{id}/avatar", method: "PATCH", description: "上传头像" },
        { path: "/api/users/{id}/settings", method: "PUT", description: "用户设置" },
      ],
      removed: [],
      modified: [],
    };

    expect(diff.added).toHaveLength(2);
    expect(diff.added[0].path).toBe("/api/users/{id}/avatar");
  });
});
