import { describe, expect, it } from "vitest";
import {
  evaluateResult,
  classifyRequestError,
  buildVariableContext,
  type EvaluationResult,
} from "../routes/test-exec.js";
import type { TestCase, Environment } from "@nexqa/shared";

// Helper to create a minimal TestCase for testing evaluateResult
function makeTestCase(overrides: Partial<TestCase> = {}): TestCase {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    endpointId: "550e8400-e29b-41d4-a716-446655440001",
    name: "Test Case",
    request: {
      method: "GET",
      path: "/test",
      headers: {},
      query: {},
      timeout: 30000,
    },
    expected: {
      status: 200,
      bodyContains: null,
      bodySchema: null,
    },
    tags: {
      purpose: ["functional"],
      strategy: ["positive"],
      phase: ["full"],
      priority: "P1",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("evaluateResult", () => {
  it("should pass when status matches", () => {
    const tc = makeTestCase({ expected: { status: 200, bodyContains: null, bodySchema: null } });
    const result = evaluateResult(tc, { status: 200, body: "ok" });
    expect(result.passed).toBe(true);
    expect(result.failType).toBeNull();
  });

  it("should fail with status_mismatch", () => {
    const tc = makeTestCase({ expected: { status: 200, bodyContains: null, bodySchema: null } });
    const result = evaluateResult(tc, { status: 404, body: "not found" });
    expect(result.passed).toBe(false);
    expect(result.failType).toBe("status_mismatch");
  });

  it("should fail with body_mismatch", () => {
    const tc = makeTestCase({ expected: { status: 200, bodyContains: "success", bodySchema: null } });
    const result = evaluateResult(tc, { status: 200, body: "error happened" });
    expect(result.passed).toBe(false);
    expect(result.failType).toBe("body_mismatch");
  });

  it("should fail with timeout when duration >= timeout", () => {
    const tc = makeTestCase({
      request: { method: "GET", path: "/test", headers: {}, query: {}, timeout: 5000 },
      expected: { status: 200, bodyContains: null, bodySchema: null },
    });
    const result = evaluateResult(tc, { status: 200, body: "ok", duration: 5000 });
    expect(result.passed).toBe(false);
    expect(result.failType).toBe("timeout");
  });

  it("should fail with auth_failure on unexpected 401", () => {
    const tc = makeTestCase({ expected: { status: 200, bodyContains: null, bodySchema: null } });
    const result = evaluateResult(tc, { status: 401, body: "unauthorized" });
    expect(result.passed).toBe(false);
    expect(result.failType).toBe("auth_failure");
  });

  it("should pass when 401 is expected", () => {
    const tc = makeTestCase({ expected: { status: 401, bodyContains: null, bodySchema: null } });
    const result = evaluateResult(tc, { status: 401, body: "unauthorized" });
    expect(result.passed).toBe(true);
  });

  it("should fail with schema_violation", () => {
    const tc = makeTestCase({
      expected: {
        status: 200,
        bodyContains: null,
        bodySchema: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "number" } },
        },
      },
    });
    const result = evaluateResult(tc, { status: 200, body: { name: "no id" } });
    expect(result.passed).toBe(false);
    expect(result.failType).toBe("schema_violation");
  });

  it("should pass schema validation when body matches", () => {
    const tc = makeTestCase({
      expected: {
        status: 200,
        bodyContains: null,
        bodySchema: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "number" } },
        },
      },
    });
    const result = evaluateResult(tc, { status: 200, body: { id: 42 } });
    expect(result.passed).toBe(true);
  });
});

describe("classifyRequestError", () => {
  it("should classify timeout errors", () => {
    const err = new Error("The operation was aborted due to timeout");
    err.name = "TimeoutError";
    const result = classifyRequestError(err, 5000);
    expect(result.failType).toBe("timeout");
  });

  it("should classify network errors", () => {
    const err = new Error("fetch failed: ECONNREFUSED");
    const result = classifyRequestError(err, 5000);
    expect(result.failType).toBe("network_error");
  });

  it("should classify DNS errors", () => {
    const err = new Error("getaddrinfo ENOTFOUND example.invalid");
    const result = classifyRequestError(err, 5000);
    expect(result.failType).toBe("network_error");
  });

  it("should classify unknown errors", () => {
    const err = new Error("Something weird happened");
    const result = classifyRequestError(err, 5000);
    expect(result.failType).toBe("unknown");
  });

  it("should handle non-Error objects", () => {
    const result = classifyRequestError("string error", 5000);
    expect(result.failType).toBe("unknown");
  });
});

describe("buildVariableContext", () => {
  it("should build context from environment", () => {
    const env: Environment = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      projectId: "550e8400-e29b-41d4-a716-446655440001",
      name: "dev",
      slug: "dev",
      baseURL: "http://localhost:8080",
      headers: {},
      variables: { token: "dev-token", userId: "42" },
      isDefault: true,
      order: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const ctx = buildVariableContext(env);
    expect(ctx.envVariables).toEqual({ token: "dev-token", userId: "42" });
    expect(ctx.caseVariables).toEqual({});
  });

  it("should build context with case variables", () => {
    const ctx = buildVariableContext(null, { customVar: "value" });
    expect(ctx.envVariables).toEqual({});
    expect(ctx.caseVariables).toEqual({ customVar: "value" });
  });

  it("should handle null environment", () => {
    const ctx = buildVariableContext(null);
    expect(ctx.envVariables).toEqual({});
    expect(ctx.caseVariables).toEqual({});
  });

  it("should merge env and case variables", () => {
    const env: Environment = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      projectId: "550e8400-e29b-41d4-a716-446655440001",
      name: "dev",
      slug: "dev",
      baseURL: "http://localhost:8080",
      headers: {},
      variables: { shared: "env-value" },
      isDefault: true,
      order: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const ctx = buildVariableContext(env, { caseOnly: "case-value" });
    expect(ctx.envVariables).toEqual({ shared: "env-value" });
    expect(ctx.caseVariables).toEqual({ caseOnly: "case-value" });
  });
});
