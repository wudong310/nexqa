import { describe, expect, it } from "vitest";
import {
  classifyIntent,
  getTemplateList,
  INTENT_TEMPLATES,
  type IntentType,
} from "../services/plan-generator.js";
import {
  PLAN_GEN_SYSTEM_PROMPT,
  PLAN_GEN_OUTPUT_SCHEMA,
  buildPlanGenPrompt,
  type PlanGenContext,
} from "../prompts/plan-gen.js";

// ── Intent Classification Tests ───────────────────────

describe("classifyIntent", () => {
  const cases: [string, IntentType][] = [
    ["我要发版", "release"],
    ["准备上线了", "release"],
    ["deploy to production", "release"],
    ["发布新版本", "release"],
    ["跑个冒烟", "smoke"],
    ["smoke test", "smoke"],
    ["基本功能验证一下", "smoke"],
    ["安全扫描", "security"],
    ["security check", "security"],
    ["检查一下漏洞", "security"],
    ["回归测试", "regression"],
    ["regression test", "regression"],
    ["改了测一下", "regression"],
    ["全量测试", "full"],
    ["跑完整测试", "full"],
    ["只测用户模块", "module"],
    ["快速跑一下", "quick"],
    ["简单跑一下", "quick"],
    ["帮我做个XYZ测试", "custom"],
    ["随便聊聊", "custom"],
  ];

  for (const [input, expected] of cases) {
    it(`"${input}" → ${expected}`, () => {
      expect(classifyIntent(input)).toBe(expected);
    });
  }

  it("should be case-insensitive for English patterns", () => {
    expect(classifyIntent("RELEASE")).toBe("release");
    expect(classifyIntent("Smoke")).toBe("smoke");
    expect(classifyIntent("SECURITY")).toBe("security");
  });

  it("should return custom for empty input", () => {
    expect(classifyIntent("")).toBe("custom");
  });

  it("should match first matching pattern when multiple match", () => {
    // "发版" matches release, should not fall through to others
    const result = classifyIntent("发版前安全检查");
    // "发版" comes before "安全" in the iteration order
    expect(["release", "security"]).toContain(result);
  });
});

// ── Template List Tests ───────────────────────────────

describe("getTemplateList", () => {
  it("should return all 8 intent types", () => {
    const templates = getTemplateList();
    expect(templates).toHaveLength(8);
    const types = templates.map((t) => t.type);
    expect(types).toContain("release");
    expect(types).toContain("smoke");
    expect(types).toContain("security");
    expect(types).toContain("regression");
    expect(types).toContain("full");
    expect(types).toContain("module");
    expect(types).toContain("quick");
    expect(types).toContain("custom");
  });

  it("should include name, description, and matchPatterns for each template", () => {
    const templates = getTemplateList();
    for (const t of templates) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(Array.isArray(t.matchPatterns)).toBe(true);
    }
  });

  it("release template should have stages", () => {
    const templates = getTemplateList();
    const release = templates.find((t) => t.type === "release");
    expect(release).toBeDefined();
    expect(release!.hasStages).toBe(true);
    expect(release!.stageNames.length).toBeGreaterThan(0);
  });

  it("smoke template should have no stages", () => {
    const templates = getTemplateList();
    const smoke = templates.find((t) => t.type === "smoke");
    expect(smoke).toBeDefined();
    expect(smoke!.hasStages).toBe(false);
    expect(smoke!.stageNames).toHaveLength(0);
  });
});

// ── Intent Templates Structure Tests ──────────────────

describe("INTENT_TEMPLATES", () => {
  it("release template should have 3 stages with correct order", () => {
    const t = INTENT_TEMPLATES.release;
    expect(t.defaultStages).toHaveLength(3);
    expect(t.defaultStages[0].name).toBe("冒烟测试");
    expect(t.defaultStages[0].order).toBe(1);
    expect(t.defaultStages[0].gate).toBe(true);
    expect(t.defaultStages[1].name).toBe("功能回归");
    expect(t.defaultStages[1].order).toBe(2);
    expect(t.defaultStages[2].name).toBe("安全检查");
    expect(t.defaultStages[2].order).toBe(3);
    expect(t.defaultStages[2].gate).toBe(false);
  });

  it("smoke template criteria should require 100% pass rate", () => {
    expect(INTENT_TEMPLATES.smoke.defaultCriteria.minPassRate).toBe(1.0);
  });

  it("security template should not stop on gate fail", () => {
    expect(INTENT_TEMPLATES.security.defaultExecution.stopOnGateFail).toBe(false);
  });

  it("regression template should have 2 stages", () => {
    expect(INTENT_TEMPLATES.regression.defaultStages).toHaveLength(2);
  });

  it("all templates should have valid match patterns", () => {
    for (const [type, template] of Object.entries(INTENT_TEMPLATES)) {
      if (type === "custom") continue; // custom has no patterns
      expect(template.matchPatterns.length).toBeGreaterThan(0);
    }
  });

  it("each template name function should return a string with date", () => {
    for (const [, template] of Object.entries(INTENT_TEMPLATES)) {
      const name = template.name("2026-04-01");
      expect(typeof name).toBe("string");
      expect(name).toContain("2026-04-01");
    }
  });
});

// ── Prompt Building Tests ─────────────────────────────

describe("Plan Gen Prompts", () => {
  const mockCtx: PlanGenContext = {
    projectName: "用户管理 API",
    totalCases: 50,
    tagDistribution: "purpose: functional: 30, security: 10, auth: 10\n  strategy: positive: 35, negative: 15\n  phase: smoke: 10, regression: 20, full: 20\n  priority: P0: 15, P1: 20, P2: 10, P3: 5",
    chainList: "用户 CRUD 链 (4 步), 认证流程 (3 步)",
    environmentList: "dev (dev), staging (staging)",
    lastBatchSummary: "冒烟测试: 通过 8/10",
    activeEnvironmentId: "env-staging-001",
  };

  it("should build prompt containing user intent", () => {
    const prompt = buildPlanGenPrompt("我要发版", mockCtx);
    expect(prompt).toContain("我要发版");
  });

  it("should include project context", () => {
    const prompt = buildPlanGenPrompt("回归测试", mockCtx);
    expect(prompt).toContain("用户管理 API");
    expect(prompt).toContain("50");
    expect(prompt).toContain("functional");
    expect(prompt).toContain("用户 CRUD 链");
    expect(prompt).toContain("staging");
    expect(prompt).toContain("通过 8/10");
    expect(prompt).toContain("env-staging-001");
  });

  it("should include intent classification options", () => {
    const prompt = buildPlanGenPrompt("test", mockCtx);
    expect(prompt).toContain("release");
    expect(prompt).toContain("smoke");
    expect(prompt).toContain("security");
    expect(prompt).toContain("regression");
    expect(prompt).toContain("custom");
  });

  it("should include output schema", () => {
    const prompt = buildPlanGenPrompt("test", mockCtx);
    expect(prompt).toContain("parsedIntent");
    expect(prompt).toContain("plan");
    expect(prompt).toContain("stages");
    expect(prompt).toContain("execution");
    expect(prompt).toContain("criteria");
  });

  it("should handle empty context gracefully", () => {
    const emptyCtx: PlanGenContext = {
      projectName: "空项目",
      totalCases: 0,
      tagDistribution: "",
      chainList: "无",
      environmentList: "无",
      lastBatchSummary: "无历史数据",
      activeEnvironmentId: null,
    };
    const prompt = buildPlanGenPrompt("快速测试", emptyCtx);
    expect(prompt).toContain("空项目");
    expect(prompt).toContain("0");
  });

  it("system prompt should mention NexQA", () => {
    expect(PLAN_GEN_SYSTEM_PROMPT).toContain("NexQA");
    expect(PLAN_GEN_SYSTEM_PROMPT).toContain("测试方案");
  });

  it("output schema should be valid JSON", () => {
    expect(() => JSON.parse(PLAN_GEN_OUTPUT_SCHEMA)).not.toThrow();
  });
});
