import { describe, expect, it, vi, beforeEach } from "vitest";

/* ── Mock storage ────────────────────────────────── */
const { mockStorage } = vi.hoisted(() => {
  const mockStorage = {
    list: vi.fn(),
    read: vi.fn(),
    write: vi.fn(),
    remove: vi.fn(),
    readRaw: vi.fn(),
    writeRaw: vi.fn(),
  };
  return { mockStorage };
});

vi.mock("../services/storage.js", () => ({
  storage: mockStorage,
}));

/* ── Mock safeFetch ──────────────────────────────── */
const { mockSafeFetch } = vi.hoisted(() => {
  const mockSafeFetch = vi.fn();
  return { mockSafeFetch };
});

vi.mock("../services/safe-fetch.js", () => ({
  safeFetch: mockSafeFetch,
}));

/* ── Mock LLM ────────────────────────────────────── */
vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

import { ruleBasedAttackSurfaces } from "../services/security-scanner.js";
import { SECURITY_PAYLOADS, CWE_MAP, OWASP_TOP_10, REMEDIATION_TEMPLATES } from "../services/security-payloads.js";
import type { AttackSurface, SecurityTestType } from "../services/security-types.js";

/* ── Helper: 构造 ApiEndpoint ────────────────────── */
function makeEndpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: "ep-001",
    projectId: "proj-001",
    method: "POST" as const,
    path: "/api/users",
    summary: "创建用户",
    headers: [
      { name: "Authorization", type: "string", required: true, description: "Bearer token" },
    ],
    queryParams: [],
    pathParams: [],
    body: {
      contentType: "application/json",
      example: { name: "test", email: "test@example.com" },
    },
    responses: [{ status: 200, description: "success" }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/* ════════════════════════════════════════════════════
   1. 内置 Payload 库测试
   ════════════════════════════════════════════════════ */

describe("security-payloads", () => {
  it("包含 7 大类 payload（sql-injection, xss, idor, auth-bypass, path-traversal, ssrf, command-injection）", () => {
    const expectedTypes: SecurityTestType[] = [
      "sql-injection",
      "xss",
      "idor",
      "auth-bypass",
      "path-traversal",
      "ssrf",
      "command-injection",
    ];
    for (const type of expectedTypes) {
      expect(SECURITY_PAYLOADS[type]).toBeDefined();
      expect(SECURITY_PAYLOADS[type].length).toBeGreaterThan(0);
    }
  });

  it("总 payload 数量 ≥ 30", () => {
    const total = Object.values(SECURITY_PAYLOADS).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );
    expect(total).toBeGreaterThanOrEqual(30);
  });

  it("每个 payload 都有 detectRule", () => {
    for (const [type, payloads] of Object.entries(SECURITY_PAYLOADS)) {
      for (const p of payloads) {
        expect(p.detectRule).toBeDefined();
        expect(p.detectRule.type).toBeDefined();
        expect(p.detectRule.condition).toBeDefined();
        expect(p.detectRule.vulnerable).toBeDefined();
      }
    }
  });

  it("sql-injection 有至少 5 个 payload", () => {
    expect(SECURITY_PAYLOADS["sql-injection"].length).toBeGreaterThanOrEqual(5);
  });

  it("每种类型都有 CWE 映射", () => {
    const types: SecurityTestType[] = [
      "sql-injection", "xss", "path-traversal", "auth-bypass",
      "idor", "ssrf", "command-injection", "overflow",
      "info-disclosure", "rate-limit",
    ];
    for (const type of types) {
      expect(CWE_MAP[type]).toBeDefined();
      expect(CWE_MAP[type]).toMatch(/^CWE-\d+$/);
    }
  });

  it("每种类型都有修复建议模板", () => {
    const types: SecurityTestType[] = [
      "sql-injection", "xss", "path-traversal", "auth-bypass",
      "idor", "ssrf", "command-injection", "overflow",
      "info-disclosure", "rate-limit",
    ];
    for (const type of types) {
      const tmpl = REMEDIATION_TEMPLATES[type];
      expect(tmpl).toBeDefined();
      expect(tmpl.summary.length).toBeGreaterThan(0);
      expect(tmpl.details.length).toBeGreaterThan(0);
      expect(tmpl.reference.length).toBeGreaterThan(0);
    }
  });

  it("OWASP Top 10 覆盖了 10 个类别", () => {
    expect(OWASP_TOP_10).toHaveLength(10);
    expect(OWASP_TOP_10[0].category).toContain("A01");
    expect(OWASP_TOP_10[9].category).toContain("A10");
  });
});

/* ════════════════════════════════════════════════════
   2. 规则引擎攻击面识别测试
   ════════════════════════════════════════════════════ */

describe("ruleBasedAttackSurfaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST 端点 + 字符串 body 参数 → 识别 sql-injection, xss, overflow", () => {
    const ep = makeEndpoint();
    const surfaces = ruleBasedAttackSurfaces([ep] as any);

    expect(surfaces.length).toBe(1);
    const vectors = surfaces[0].vectors;
    const types = vectors.map((v) => v.type);

    expect(types).toContain("sql-injection");
    expect(types).toContain("xss");
    expect(types).toContain("overflow");
  });

  it("有 Authorization header → 识别 auth-bypass", () => {
    const ep = makeEndpoint();
    const surfaces = ruleBasedAttackSurfaces([ep] as any);
    const types = surfaces[0].vectors.map((v) => v.type);

    expect(types).toContain("auth-bypass");
  });

  it("POST 方法 → 识别 info-disclosure 和 rate-limit", () => {
    const ep = makeEndpoint();
    const surfaces = ruleBasedAttackSurfaces([ep] as any);
    const types = surfaces[0].vectors.map((v) => v.type);

    expect(types).toContain("info-disclosure");
    expect(types).toContain("rate-limit");
  });

  it("路径参数 + ID → 识别 idor", () => {
    const ep = makeEndpoint({
      method: "GET",
      path: "/api/users/:userId",
      pathParams: [{ name: "userId", type: "string", required: true, description: "" }],
      headers: [],
      body: undefined,
    });
    const surfaces = ruleBasedAttackSurfaces([ep] as any);
    const types = surfaces[0].vectors.map((v) => v.type);

    expect(types).toContain("idor");
  });

  it("URL 类型查询参数 → 识别 ssrf", () => {
    const ep = makeEndpoint({
      method: "GET",
      path: "/api/fetch",
      headers: [],
      body: undefined,
      queryParams: [
        { name: "url", type: "string", required: true, description: "目标 URL" },
      ],
    });
    const surfaces = ruleBasedAttackSurfaces([ep] as any);
    const types = surfaces[0].vectors.map((v) => v.type);

    expect(types).toContain("ssrf");
    expect(types).toContain("sql-injection"); // 也是字符串参数
    expect(types).toContain("xss");
  });

  it("body 中有 file/path 相关字段 → 识别 path-traversal", () => {
    const ep = makeEndpoint({
      body: {
        contentType: "application/json",
        example: { filePath: "/uploads/doc.pdf", name: "test" },
      },
    });
    const surfaces = ruleBasedAttackSurfaces([ep] as any);
    const types = surfaces[0].vectors.map((v) => v.type);

    expect(types).toContain("path-traversal");
  });

  it("body 中有 command 相关字段 → 识别 command-injection", () => {
    const ep = makeEndpoint({
      body: {
        contentType: "application/json",
        example: { command: "ls -la", name: "task" },
      },
    });
    const surfaces = ruleBasedAttackSurfaces([ep] as any);
    const types = surfaces[0].vectors.map((v) => v.type);

    expect(types).toContain("command-injection");
  });

  it("filterTypes 过滤只返回指定类型", () => {
    const ep = makeEndpoint();
    const surfaces = ruleBasedAttackSurfaces([ep] as any, ["sql-injection"]);
    const types = surfaces[0].vectors.map((v) => v.type);

    expect(types).toEqual(["sql-injection", "sql-injection"]); // body.name + body.email
    expect(types.every((t) => t === "sql-injection")).toBe(true);
  });

  it("空端点列表 → 返回空数组", () => {
    const surfaces = ruleBasedAttackSurfaces([]);
    expect(surfaces).toEqual([]);
  });

  it("每个 vector 都有 payloadCount", () => {
    const ep = makeEndpoint();
    const surfaces = ruleBasedAttackSurfaces([ep] as any);

    for (const v of surfaces[0].vectors) {
      expect(v.payloadCount).toBeDefined();
      expect(v.payloadCount).toBeGreaterThanOrEqual(0);
    }
  });

  it("GET 端点无 body → 不生成 info-disclosure 和 rate-limit", () => {
    const ep = makeEndpoint({
      method: "GET",
      path: "/api/health",
      headers: [],
      body: undefined,
      queryParams: [],
      pathParams: [],
    });
    const surfaces = ruleBasedAttackSurfaces([ep] as any);
    // GET 无参数端点不应有任何攻击面
    expect(surfaces).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════
   3. 安全扫描 API 路由测试
   ════════════════════════════════════════════════════ */

// NOTE: 旧 security API routes 测试已随 routes/security.ts 删除
// 对应功能已迁移至 project-security.ts，相关测试请移至对应文件

/* ════════════════════════════════════════════════════
   4. DetectRule 评估测试
   ════════════════════════════════════════════════════ */

describe("DetectRule evaluation (via payload library)", () => {
  it("status 类型 payload 条件描述合理", () => {
    const sqlPayloads = SECURITY_PAYLOADS["sql-injection"];
    const statusRules = sqlPayloads.filter((p) => p.detectRule.type === "status");
    expect(statusRules.length).toBeGreaterThan(0);

    for (const p of statusRules) {
      expect(p.detectRule.condition).toContain("status");
    }
  });

  it("timing 类型 payload 条件包含 duration", () => {
    const sqlPayloads = SECURITY_PAYLOADS["sql-injection"];
    const timingRules = sqlPayloads.filter((p) => p.detectRule.type === "timing");
    expect(timingRules.length).toBeGreaterThan(0);

    for (const p of timingRules) {
      expect(p.detectRule.condition).toContain("duration");
    }
  });

  it("body-contains 类型 payload 条件为非空字符串", () => {
    const xssPayloads = SECURITY_PAYLOADS["xss"];
    const bodyRules = xssPayloads.filter((p) => p.detectRule.type === "body-contains");
    expect(bodyRules.length).toBeGreaterThan(0);

    for (const p of bodyRules) {
      expect(p.detectRule.condition.length).toBeGreaterThan(0);
    }
  });
});
