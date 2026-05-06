import { describe, expect, it } from "vitest";
import { checkSkip, batchCheckSkip, type SkipContext } from "../services/skip-logic.js";
import type { TestCase } from "@nexqa/shared";

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

describe("skip-logic", () => {
  describe("checkSkip", () => {
    it("不跳过 — 无条件命中", () => {
      const tc = makeTestCase();
      const result = checkSkip(tc, {});
      expect(result.skipped).toBe(false);
      expect(result.skipReason).toBeNull();
    });

    it("跳过 — 手动排除", () => {
      const tc = makeTestCase();
      const ctx: SkipContext = {
        excludedCaseIds: new Set([tc.id]),
      };
      const result = checkSkip(tc, ctx);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe("manually_excluded");
    });

    it("跳过 — 标记 disabled", () => {
      const tc = makeTestCase();
      const ctx: SkipContext = {
        disabledCaseIds: new Set([tc.id]),
      };
      const result = checkSkip(tc, ctx);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe("disabled");
    });

    it("跳过 — 阶段不匹配", () => {
      const tc = makeTestCase({
        tags: {
          purpose: ["functional"],
          strategy: ["positive"],
          phase: ["smoke"],
          priority: "P0",
        },
      });
      const ctx: SkipContext = {
        currentPhase: "regression",
      };
      const result = checkSkip(tc, ctx);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe("phase_mismatch");
    });

    it("不跳过 — 阶段匹配", () => {
      const tc = makeTestCase({
        tags: {
          purpose: ["functional"],
          strategy: ["positive"],
          phase: ["smoke", "full"],
          priority: "P0",
        },
      });
      const ctx: SkipContext = {
        currentPhase: "smoke",
      };
      const result = checkSkip(tc, ctx);
      expect(result.skipped).toBe(false);
    });

    it("跳过 — 依赖用例失败", () => {
      const depId = "550e8400-e29b-41d4-a716-446655440099";
      const tc = makeTestCase();
      const ctx: SkipContext = {
        dependsOnCaseIds: [depId],
        failedCaseIds: new Set([depId]),
      };
      const result = checkSkip(tc, ctx);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe("dependency_failed");
    });

    it("跳过 — 前置链未通过", () => {
      const chainId = "550e8400-e29b-41d4-a716-446655440088";
      const tc = makeTestCase();
      const ctx: SkipContext = {
        chainId,
        failedChainIds: new Set([chainId]),
      };
      const result = checkSkip(tc, ctx);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe("chain_prerequisite_failed");
    });

    it("跳过 — 缺少环境变量", () => {
      const tc = makeTestCase({
        request: {
          method: "GET",
          path: "/api/users/{{userId}}",
          headers: { Authorization: "Bearer {{token}}" },
          query: {},
          timeout: 30000,
        },
      });
      const ctx: SkipContext = {
        variableCtx: {
          caseVariables: {},
          envVariables: {},
        },
      };
      const result = checkSkip(tc, ctx);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe("missing_variable");
      expect(result.skipDetail).toContain("userId");
    });

    it("不跳过 — 变量已解析", () => {
      const tc = makeTestCase({
        request: {
          method: "GET",
          path: "/api/users/{{userId}}",
          headers: {},
          query: {},
          timeout: 30000,
        },
      });
      const ctx: SkipContext = {
        variableCtx: {
          caseVariables: {},
          envVariables: { userId: "42" },
        },
      };
      const result = checkSkip(tc, ctx);
      expect(result.skipped).toBe(false);
    });

    it("优先级 — 手动排除优先于阶段不匹配", () => {
      const tc = makeTestCase({
        tags: {
          purpose: ["functional"],
          strategy: ["positive"],
          phase: ["smoke"],
          priority: "P0",
        },
      });
      const ctx: SkipContext = {
        excludedCaseIds: new Set([tc.id]),
        currentPhase: "regression",
      };
      const result = checkSkip(tc, ctx);
      expect(result.skipReason).toBe("manually_excluded");
    });
  });

  describe("batchCheckSkip", () => {
    it("批量检查 — 返回需要跳过的用例", () => {
      const tc1 = makeTestCase({ id: "550e8400-e29b-41d4-a716-446655440001" });
      const tc2 = makeTestCase({ id: "550e8400-e29b-41d4-a716-446655440002" });
      const ctx: SkipContext = {
        disabledCaseIds: new Set(["550e8400-e29b-41d4-a716-446655440001"]),
      };
      const results = batchCheckSkip([tc1, tc2], ctx);
      expect(results.size).toBe(1);
      expect(results.get("550e8400-e29b-41d4-a716-446655440001")?.skipReason).toBe("disabled");
    });
  });
});
