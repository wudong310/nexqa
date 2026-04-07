import { describe, expect, it } from "vitest";
import {
  buildAnalysisPrompt,
  buildSingleCaseAnalysisPrompt,
  ANALYSIS_SYSTEM_PROMPT,
} from "../prompts/ai-analysis.js";
import {
  buildSmokePrompt,
  SMOKE_SYSTEM_PROMPT,
} from "../prompts/smoke-test.js";

describe("AI Analysis prompts", () => {
  it("should build batch analysis prompt with failed results", () => {
    const failedResults = [
      {
        resultId: "r1",
        caseName: "创建用户 - 缺少 email",
        endpoint: "POST /api/users",
        failType: "status_mismatch",
        failReason: "Expected status 400, got 500",
      },
    ];

    const prompt = buildAnalysisPrompt(failedResults);
    expect(prompt).toContain("分析批次测试失败结果");
    expect(prompt).toContain("创建用户 - 缺少 email");
    expect(prompt).toContain("status_mismatch");
    expect(prompt).toContain("api-bug");
    expect(prompt).toContain("env-issue");
  });

  it("should build single case analysis prompt", () => {
    const result = {
      resultId: "r1",
      caseName: "获取订单",
      endpoint: "GET /api/orders",
      failType: "timeout",
      failReason: "Request timed out",
    };

    const prompt = buildSingleCaseAnalysisPrompt(result);
    expect(prompt).toContain("分析单个测试失败结果");
    expect(prompt).toContain("获取订单");
    expect(prompt).toContain("timeout");
  });

  it("should have system prompt", () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toContain("NexQA");
    expect(ANALYSIS_SYSTEM_PROMPT).toContain("测试分析引擎");
  });
});

describe("Smoke Test prompts", () => {
  it("should build smoke prompt with endpoints and cases", () => {
    const endpoints = [
      { id: "ep1", method: "POST", path: "/api/auth/login" },
      { id: "ep2", method: "GET", path: "/api/users" },
    ];
    const cases = [
      { caseId: "c1", name: "登录", method: "POST", path: "/api/auth/login" },
    ];

    const prompt = buildSmokePrompt(endpoints, cases);
    expect(prompt).toContain("生成冒烟测试方案");
    expect(prompt).toContain("/api/auth/login");
    expect(prompt).toContain("核心路径");
    expect(prompt).toContain("auth");
    expect(prompt).toContain("crud");
  });

  it("should have system prompt", () => {
    expect(SMOKE_SYSTEM_PROMPT).toContain("冒烟测试");
    expect(SMOKE_SYSTEM_PROMPT).toContain("NexQA");
  });
});
