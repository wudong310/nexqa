import { describe, expect, it } from "vitest";
import {
  ApiEndpointSchema,
  BatchRunSchema,
  BatchRunResultSchema,
  CreateBatchRunSchema,
  EnvironmentSchema,
  CreateEnvironmentSchema,
  LlmConfigSchema,
  ProjectSchema,
  SettingsSchema,
  TestCaseSchema,
  TestCaseTagsSchema,
  TestResultSchema,
} from "../index.js";

describe("SettingsSchema", () => {
  it("should parse defaults", () => {
    const result = SettingsSchema.parse({});
    expect(result.theme).toBe("system");
    expect(result.language).toBe("zh-CN");
    expect(result.llm).toBeUndefined();
  });

  it("should parse full settings", () => {
    const result = SettingsSchema.parse({
      llm: {
        provider: "openai-compatible",
        baseURL: "https://api.deepseek.com/v1",
        apiKey: "sk-test",
        model: "deepseek-chat",
      },
      theme: "dark",
      language: "en",
    });
    expect(result.llm?.provider).toBe("openai-compatible");
    expect(result.theme).toBe("dark");
  });
});

describe("LlmConfigSchema", () => {
  it("should validate openai-compatible", () => {
    const result = LlmConfigSchema.parse({
      provider: "openai-compatible",
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(result.provider).toBe("openai-compatible");
    expect(result.baseURL).toBeUndefined();
  });

  it("should validate anthropic", () => {
    const result = LlmConfigSchema.parse({
      provider: "anthropic",
      apiKey: "sk-ant-test",
      model: "claude-sonnet-4-20250514",
    });
    expect(result.provider).toBe("anthropic");
  });

  it("should reject empty apiKey", () => {
    expect(() =>
      LlmConfigSchema.parse({
        provider: "anthropic",
        apiKey: "",
        model: "claude",
      }),
    ).toThrow();
  });
});

describe("ProjectSchema", () => {
  it("should parse a valid project", () => {
    const result = ProjectSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Test Project",
      baseURL: "https://api.example.com",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.headers).toEqual({});
  });
});

describe("ApiEndpointSchema", () => {
  it("should parse with defaults", () => {
    const result = ApiEndpointSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      projectId: "550e8400-e29b-41d4-a716-446655440001",
      method: "GET",
      path: "/api/users",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.summary).toBe("");
    expect(result.headers).toEqual([]);
  });
});

describe("TestCaseSchema", () => {
  it("should parse a test case with new structured tags", () => {
    const result = TestCaseSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      endpointId: "550e8400-e29b-41d4-a716-446655440001",
      name: "Create user - happy path",
      request: { method: "POST", path: "/users", body: { name: "test" } },
      expected: { status: 201 },
      tags: {
        purpose: ["functional"],
        strategy: ["positive"],
        phase: ["smoke"],
        priority: "P0",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.tags.priority).toBe("P0");
    expect(result.tags.phase).toEqual(["smoke"]);
    expect(result.tags.purpose).toEqual(["functional"]);
    expect(result.tags.strategy).toEqual(["positive"]);
  });

  it("should reject legacy string[] tags (no longer supported)", () => {
    expect(() =>
      TestCaseSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        endpointId: "550e8400-e29b-41d4-a716-446655440001",
        name: "Smoke test",
        request: { method: "GET", path: "/health" },
        expected: { status: 200 },
        tags: ["冒烟", "正向"],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("should use default tags when none provided", () => {
    const result = TestCaseSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      endpointId: "550e8400-e29b-41d4-a716-446655440001",
      name: "Create user - happy path",
      request: { method: "POST", path: "/users", body: { name: "test" } },
      expected: { status: 201 },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.tags).toEqual({
      purpose: ["functional"],
      strategy: ["positive"],
      phase: ["full"],
      priority: "P1",
    });
  });

  it("should parse bodySchema in expected", () => {
    const result = TestCaseSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      endpointId: "550e8400-e29b-41d4-a716-446655440001",
      name: "Get user - schema check",
      request: { method: "GET", path: "/users/1" },
      expected: {
        status: 200,
        bodySchema: {
          type: "object",
          required: ["id", "name"],
          properties: {
            id: { type: "number" },
            name: { type: "string" },
          },
        },
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.expected.bodySchema).toBeDefined();
    expect((result.expected.bodySchema as Record<string, unknown>).type).toBe("object");
  });
});

describe("TestCaseTagsSchema", () => {
  it("should parse full tags", () => {
    const result = TestCaseTagsSchema.parse({
      purpose: ["functional", "auth"],
      strategy: ["positive"],
      phase: ["smoke", "full"],
      priority: "P0",
    });
    expect(result.purpose).toEqual(["functional", "auth"]);
    expect(result.priority).toBe("P0");
  });

  it("should apply defaults", () => {
    const result = TestCaseTagsSchema.parse({});
    expect(result.purpose).toEqual(["functional"]);
    expect(result.strategy).toEqual(["positive"]);
    expect(result.phase).toEqual(["full"]);
    expect(result.priority).toBe("P1");
  });

  it("should reject empty arrays", () => {
    expect(() =>
      TestCaseTagsSchema.parse({ purpose: [] }),
    ).toThrow();
  });

  it("should reject invalid priority", () => {
    expect(() =>
      TestCaseTagsSchema.parse({ priority: "P5" }),
    ).toThrow();
  });
});

describe("TestCaseTags — StrategySchema validates all strategy values", () => {
  it("should accept negative as a valid strategy", () => {
    const result = TestCaseTagsSchema.parse({
      strategy: ["negative"],
    });
    expect(result.strategy).toEqual(["negative"]);
  });

  it("should accept boundary as a valid strategy", () => {
    const result = TestCaseTagsSchema.parse({
      strategy: ["boundary"],
    });
    expect(result.strategy).toEqual(["boundary"]);
  });

  it("should accept destructive as a valid strategy", () => {
    const result = TestCaseTagsSchema.parse({
      strategy: ["destructive"],
    });
    expect(result.strategy).toEqual(["destructive"]);
  });

  it("should accept multiple strategies", () => {
    const result = TestCaseTagsSchema.parse({
      strategy: ["positive", "negative", "boundary"],
    });
    expect(result.strategy).toEqual(["positive", "negative", "boundary"]);
  });
});

describe("TestResultSchema", () => {
  it("should parse a valid result with failType", () => {
    const result = TestResultSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      caseId: "550e8400-e29b-41d4-a716-446655440001",
      projectId: "550e8400-e29b-41d4-a716-446655440002",
      timestamp: "2026-01-01T00:00:00.000Z",
      request: {
        method: "POST",
        url: "https://api.example.com/users",
        body: {},
      },
      response: {
        status: 201,
        statusText: "Created",
        body: { id: 1 },
        duration: 45,
      },
      passed: true,
    });
    expect(result.failReason).toBeNull();
    expect(result.failType).toBeNull();
  });

  it("should parse a failed result with schema_violation", () => {
    const result = TestResultSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      caseId: "550e8400-e29b-41d4-a716-446655440001",
      projectId: "550e8400-e29b-41d4-a716-446655440002",
      timestamp: "2026-01-01T00:00:00.000Z",
      request: {
        method: "GET",
        url: "https://api.example.com/users/1",
      },
      response: {
        status: 200,
        statusText: "OK",
        body: { id: 1 },
        duration: 30,
      },
      passed: false,
      failReason: "Schema validation failed: /name must be string",
      failType: "schema_violation",
    });
    expect(result.failType).toBe("schema_violation");
  });

  it("should accept all valid failType values", () => {
    const failTypes = [
      "status_mismatch",
      "schema_violation",
      "body_mismatch",
      "timeout",
      "network_error",
      "auth_failure",
      "unknown",
      "script_error",
      "variable_error",
      "chain_dependency",
    ];
    for (const ft of failTypes) {
      const result = TestResultSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        caseId: "550e8400-e29b-41d4-a716-446655440001",
        projectId: "550e8400-e29b-41d4-a716-446655440002",
        timestamp: "2026-01-01T00:00:00.000Z",
        request: { method: "GET", url: "https://api.example.com" },
        response: { status: 500, statusText: "Error", body: null, duration: 10 },
        passed: false,
        failReason: `Test ${ft}`,
        failType: ft,
      });
      expect(result.failType).toBe(ft);
    }
  });

  it("should reject invalid failType values", () => {
    expect(() =>
      TestResultSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        caseId: "550e8400-e29b-41d4-a716-446655440001",
        projectId: "550e8400-e29b-41d4-a716-446655440002",
        timestamp: "2026-01-01T00:00:00.000Z",
        request: { method: "GET", url: "https://api.example.com" },
        response: { status: 500, statusText: "Error", body: null, duration: 10 },
        passed: false,
        failReason: "test",
        failType: "invalid_type",
      }),
    ).toThrow();
  });
});

describe("EnvironmentSchema", () => {
  it("should parse a valid environment", () => {
    const result = EnvironmentSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      projectId: "550e8400-e29b-41d4-a716-446655440001",
      name: "开发环境",
      slug: "dev",
      baseURL: "http://localhost:8080",
      headers: { Authorization: "Bearer dev-token" },
      variables: { userId: "dev-001" },
      isDefault: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.name).toBe("开发环境");
    expect(result.slug).toBe("dev");
    expect(result.isDefault).toBe(true);
    expect(result.variables.userId).toBe("dev-001");
  });

  it("should apply defaults for optional fields", () => {
    const result = EnvironmentSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      projectId: "550e8400-e29b-41d4-a716-446655440001",
      name: "测试环境",
      slug: "test",
      baseURL: "https://test.api.com",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.headers).toEqual({});
    expect(result.variables).toEqual({});
    expect(result.isDefault).toBe(false);
  });

  it("should reject invalid slug format", () => {
    expect(() =>
      EnvironmentSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        projectId: "550e8400-e29b-41d4-a716-446655440001",
        name: "Bad Slug",
        slug: "BAD SLUG!",
        baseURL: "https://test.api.com",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow();
  });
});

describe("CreateEnvironmentSchema", () => {
  it("should validate create input", () => {
    const result = CreateEnvironmentSchema.parse({
      name: "预发环境",
      slug: "staging",
      baseURL: "https://staging.api.com",
      headers: { "X-Env": "staging" },
      variables: { token: "stg-token" },
    });
    expect(result.name).toBe("预发环境");
    expect(result.isDefault).toBe(false);
  });

  it("should reject missing required fields", () => {
    expect(() =>
      CreateEnvironmentSchema.parse({ name: "test" }),
    ).toThrow();
  });
});

describe("BatchRunSchema", () => {
  it("should parse a valid batch run", () => {
    const result = BatchRunSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      projectId: "550e8400-e29b-41d4-a716-446655440001",
      name: "v2.1 回归测试",
      environmentId: "550e8400-e29b-41d4-a716-446655440002",
      status: "running",
      totalCases: 10,
      passedCases: 5,
      failedCases: 2,
      skippedCases: 0,
      failureBreakdown: { status_mismatch: 1, schema_violation: 1 },
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.name).toBe("v2.1 回归测试");
    expect(result.status).toBe("running");
    expect(result.totalCases).toBe(10);
    expect(result.failureBreakdown.status_mismatch).toBe(1);
  });

  it("should apply defaults for optional fields", () => {
    const result = BatchRunSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      projectId: "550e8400-e29b-41d4-a716-446655440001",
      name: "Quick test",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.status).toBe("pending");
    expect(result.environmentId).toBeNull();
    expect(result.totalCases).toBe(0);
    expect(result.passedCases).toBe(0);
    expect(result.failedCases).toBe(0);
    expect(result.skippedCases).toBe(0);
    expect(result.failureBreakdown).toEqual({});
    expect(result.startedAt).toBeNull();
    expect(result.completedAt).toBeNull();
  });

  it("should reject invalid status", () => {
    expect(() =>
      BatchRunSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        projectId: "550e8400-e29b-41d4-a716-446655440001",
        name: "Bad",
        status: "cancelled",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("should accept all valid statuses", () => {
    for (const status of ["pending", "running", "completed", "failed"]) {
      const result = BatchRunSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        projectId: "550e8400-e29b-41d4-a716-446655440001",
        name: "Test",
        status,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      expect(result.status).toBe(status);
    }
  });
});

describe("CreateBatchRunSchema", () => {
  it("should validate create input with filters", () => {
    const result = CreateBatchRunSchema.parse({
      projectId: "550e8400-e29b-41d4-a716-446655440001",
      name: "冒烟测试",
      environmentId: "550e8400-e29b-41d4-a716-446655440002",
      caseIds: ["550e8400-e29b-41d4-a716-446655440010"],
      tagFilter: { priority: "P0", phase: ["smoke"] },
    });
    expect(result.name).toBe("冒烟测试");
    expect(result.caseIds).toHaveLength(1);
    expect(result.tagFilter?.priority).toBe("P0");
  });

  it("should accept minimal input", () => {
    const result = CreateBatchRunSchema.parse({
      projectId: "550e8400-e29b-41d4-a716-446655440001",
      name: "All tests",
    });
    expect(result.environmentId).toBeNull();
    expect(result.caseIds).toBeUndefined();
    expect(result.endpointIds).toBeUndefined();
    expect(result.tagFilter).toBeUndefined();
  });

  it("should reject missing name", () => {
    expect(() =>
      CreateBatchRunSchema.parse({
        projectId: "550e8400-e29b-41d4-a716-446655440001",
      }),
    ).toThrow();
  });
});

describe("BatchRunResultSchema", () => {
  it("should parse a valid batch run result", () => {
    const result = BatchRunResultSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      batchRunId: "550e8400-e29b-41d4-a716-446655440001",
      resultId: "550e8400-e29b-41d4-a716-446655440002",
      caseId: "550e8400-e29b-41d4-a716-446655440003",
      passed: false,
      failType: "timeout",
    });
    expect(result.passed).toBe(false);
    expect(result.failType).toBe("timeout");
  });

  it("should default failType to null", () => {
    const result = BatchRunResultSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      batchRunId: "550e8400-e29b-41d4-a716-446655440001",
      resultId: "550e8400-e29b-41d4-a716-446655440002",
      caseId: "550e8400-e29b-41d4-a716-446655440003",
      passed: true,
    });
    expect(result.failType).toBeNull();
  });
});
