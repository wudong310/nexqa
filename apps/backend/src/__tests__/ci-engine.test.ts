/**
 * ci-engine.test.ts — CI/CD 引擎单元测试
 *
 * 覆盖：
 * - GitHub 签名验证
 * - GitLab Token 验证
 * - 文件变更提取
 * - 分支名提取
 * - Glob 匹配
 * - 触发规则匹配
 * - CI 执行记录管理
 */

import { describe, expect, it } from "vitest";
import {
  verifyGitHubSignature,
  verifyGitLabToken,
  extractGitHubChangedFiles,
  extractGitLabChangedFiles,
  extractBranchFromRef,
  globMatch,
  shouldTrigger,
  generateWebhookToken,
  generateWebhookSecret,
} from "../services/ci-engine.js";
import type { TriggerRule, GitHubPushPayload, GitLabPushPayload } from "../services/ci-types.js";
import type { MatchContext } from "../services/ci-engine.js";

// ── Token generation ─────────────────────────────

describe("generateWebhookToken", () => {
  it("should generate token with nexqa_wh_ prefix", () => {
    const token = generateWebhookToken();
    expect(token).toMatch(/^nexqa_wh_[a-f0-9]{48}$/);
  });

  it("should generate unique tokens", () => {
    const t1 = generateWebhookToken();
    const t2 = generateWebhookToken();
    expect(t1).not.toBe(t2);
  });
});

describe("generateWebhookSecret", () => {
  it("should generate 64-char hex secret", () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ── GitHub signature verification ────────────────

describe("verifyGitHubSignature", () => {
  const secret = "mysecret123";

  it("should verify valid signature", () => {
    const body = '{"ref":"refs/heads/main"}';
    // Pre-compute: HMAC-SHA256 of body with secret
    const crypto = require("node:crypto");
    const hmac = crypto.createHmac("sha256", secret);
    const signature = "sha256=" + hmac.update(body).digest("hex");

    expect(verifyGitHubSignature(body, signature, secret)).toBe(true);
  });

  it("should reject invalid signature", () => {
    const body = '{"ref":"refs/heads/main"}';
    expect(
      verifyGitHubSignature(body, "sha256=invalidhash", secret),
    ).toBe(false);
  });

  it("should reject tampered body", () => {
    const body = '{"ref":"refs/heads/main"}';
    const crypto = require("node:crypto");
    const hmac = crypto.createHmac("sha256", secret);
    const signature = "sha256=" + hmac.update(body).digest("hex");

    // Different body → should fail
    expect(
      verifyGitHubSignature('{"ref":"refs/heads/develop"}', signature, secret),
    ).toBe(false);
  });

  it("should handle malformed signature gracefully", () => {
    expect(verifyGitHubSignature("body", "not-a-valid-sig", secret)).toBe(
      false,
    );
  });
});

// ── GitLab token verification ────────────────────

describe("verifyGitLabToken", () => {
  it("should verify matching token", () => {
    expect(verifyGitLabToken("secret123", "secret123")).toBe(true);
  });

  it("should reject non-matching token", () => {
    expect(verifyGitLabToken("wrong", "secret123")).toBe(false);
  });

  it("should reject empty token", () => {
    expect(verifyGitLabToken(undefined, "secret123")).toBe(false);
    expect(verifyGitLabToken("", "secret123")).toBe(false);
  });
});

// ── File change extraction ───────────────────────

describe("extractGitHubChangedFiles", () => {
  it("should extract unique changed files from commits", () => {
    const payload: GitHubPushPayload = {
      ref: "refs/heads/main",
      before: "abc",
      after: "def",
      repository: { full_name: "org/repo", html_url: "https://github.com/org/repo" },
      pusher: { name: "user" },
      commits: [
        {
          id: "c1",
          message: "commit 1",
          added: ["src/new-file.ts"],
          removed: ["src/old-file.ts"],
          modified: ["src/app.ts"],
        },
        {
          id: "c2",
          message: "commit 2",
          added: [],
          removed: [],
          modified: ["src/app.ts", "openapi.yaml"],
        },
      ],
    };

    const files = extractGitHubChangedFiles(payload);
    expect(files).toContain("src/new-file.ts");
    expect(files).toContain("src/old-file.ts");
    expect(files).toContain("src/app.ts");
    expect(files).toContain("openapi.yaml");
    // No duplicates
    expect(files.filter((f) => f === "src/app.ts")).toHaveLength(1);
  });

  it("should return empty array for push with no commits", () => {
    const payload: GitHubPushPayload = {
      ref: "refs/heads/main",
      before: "abc",
      after: "def",
      repository: { full_name: "org/repo", html_url: "https://github.com/org/repo" },
      pusher: { name: "user" },
      commits: [],
    };
    expect(extractGitHubChangedFiles(payload)).toEqual([]);
  });
});

describe("extractGitLabChangedFiles", () => {
  it("should extract unique changed files from commits", () => {
    const payload: GitLabPushPayload = {
      ref: "refs/heads/main",
      before: "abc",
      after: "def",
      project: { path_with_namespace: "group/repo", web_url: "https://gitlab.com/group/repo" },
      user_name: "user",
      commits: [
        {
          id: "c1",
          message: "commit 1",
          added: ["api/spec.yaml"],
          removed: [],
          modified: ["README.md"],
        },
      ],
    };

    const files = extractGitLabChangedFiles(payload);
    expect(files).toContain("api/spec.yaml");
    expect(files).toContain("README.md");
  });
});

// ── Branch extraction ────────────────────────────

describe("extractBranchFromRef", () => {
  it("should extract branch from refs/heads/ prefix", () => {
    expect(extractBranchFromRef("refs/heads/main")).toBe("main");
    expect(extractBranchFromRef("refs/heads/feature/ci-cd")).toBe("feature/ci-cd");
  });

  it("should pass through if no refs/heads/ prefix", () => {
    expect(extractBranchFromRef("main")).toBe("main");
  });
});

// ── Glob matching ────────────────────────────────

describe("globMatch", () => {
  it("should match exact strings", () => {
    expect(globMatch("openapi.yaml", "openapi.yaml")).toBe(true);
    expect(globMatch("openapi.yaml", "openapi.json")).toBe(false);
  });

  it("should support * wildcard (no /)", () => {
    expect(globMatch("*.yaml", "openapi.yaml")).toBe(true);
    expect(globMatch("*.yaml", "spec.yaml")).toBe(true);
    expect(globMatch("*.yaml", "dir/spec.yaml")).toBe(false);
    expect(globMatch("src/*.ts", "src/app.ts")).toBe(true);
    expect(globMatch("src/*.ts", "src/sub/app.ts")).toBe(false);
  });

  it("should support ** wildcard (including /)", () => {
    expect(globMatch("src/**/*.ts", "src/app.ts")).toBe(true);
    expect(globMatch("src/**/*.ts", "src/deep/nested/app.ts")).toBe(true);
    expect(globMatch("**/*.yaml", "openapi.yaml")).toBe(true);
    expect(globMatch("**/*.yaml", "docs/api/openapi.yaml")).toBe(true);
  });

  it("should support ? wildcard", () => {
    expect(globMatch("file?.ts", "file1.ts")).toBe(true);
    expect(globMatch("file?.ts", "file12.ts")).toBe(false);
  });

  it("should match common path patterns", () => {
    // API doc changes
    expect(globMatch("**/openapi.*", "openapi.yaml")).toBe(true);
    expect(globMatch("**/openapi.*", "docs/openapi.json")).toBe(true);
    // Source code changes
    expect(globMatch("src/**", "src/routes/users.ts")).toBe(true);
    expect(globMatch("src/**", "tests/users.test.ts")).toBe(false);
  });
});

// ── Trigger rule matching ────────────────────────

describe("shouldTrigger", () => {
  const baseRule: TriggerRule = {
    id: "rule-1",
    name: "Test Rule",
    enabled: true,
    trigger: {
      type: "webhook",
      config: { branch: "main" },
    },
    action: {
      type: "smoke",
    },
    notification: {
      webhookIds: [],
      condition: "always",
    },
  };

  it("should not trigger if rule is disabled", () => {
    const rule = { ...baseRule, enabled: false };
    const ctx: MatchContext = {
      branch: "main",
      changedFiles: [],
      eventType: "push",
    };
    expect(shouldTrigger(rule, ctx)).toBe(false);
  });

  it("should match branch pattern", () => {
    const ctx: MatchContext = {
      branch: "main",
      changedFiles: [],
      eventType: "push",
    };
    expect(shouldTrigger(baseRule, ctx)).toBe(true);

    const ctxDev: MatchContext = {
      branch: "develop",
      changedFiles: [],
      eventType: "push",
    };
    expect(shouldTrigger(baseRule, ctxDev)).toBe(false);
  });

  it("should match branch with glob pattern", () => {
    const rule: TriggerRule = {
      ...baseRule,
      trigger: { type: "webhook", config: { branch: "feature/*" } },
    };
    const ctx: MatchContext = {
      branch: "feature/ci-cd",
      changedFiles: [],
      eventType: "push",
    };
    expect(shouldTrigger(rule, ctx)).toBe(true);
  });

  it("should match file path patterns", () => {
    const rule: TriggerRule = {
      ...baseRule,
      trigger: {
        type: "api-change",
        config: {
          branch: "main",
          pathPattern: "**/openapi.*",
        },
      },
    };

    const ctxMatch: MatchContext = {
      branch: "main",
      changedFiles: ["src/app.ts", "docs/openapi.yaml"],
      eventType: "push",
    };
    expect(shouldTrigger(rule, ctxMatch)).toBe(true);

    const ctxNoMatch: MatchContext = {
      branch: "main",
      changedFiles: ["src/app.ts", "README.md"],
      eventType: "push",
    };
    expect(shouldTrigger(rule, ctxNoMatch)).toBe(false);
  });

  it("should match manual trigger type", () => {
    const rule: TriggerRule = {
      ...baseRule,
      trigger: { type: "manual", config: {} },
    };
    const ctx: MatchContext = {
      branch: "",
      changedFiles: [],
      eventType: "manual",
    };
    expect(shouldTrigger(rule, ctx)).toBe(true);

    // manual rule should not match push events
    const pushCtx: MatchContext = {
      branch: "main",
      changedFiles: [],
      eventType: "push",
    };
    expect(shouldTrigger(rule, pushCtx)).toBe(false);
  });

  it("should match schedule trigger type", () => {
    const rule: TriggerRule = {
      ...baseRule,
      trigger: { type: "schedule", config: { cron: "0 8 * * *" } },
    };

    const schedCtx: MatchContext = {
      branch: "",
      changedFiles: [],
      eventType: "schedule",
    };
    expect(shouldTrigger(rule, schedCtx)).toBe(true);

    const pushCtx: MatchContext = {
      branch: "main",
      changedFiles: [],
      eventType: "push",
    };
    expect(shouldTrigger(rule, pushCtx)).toBe(false);
  });

  it("should require both branch AND path match when both configured", () => {
    const rule: TriggerRule = {
      ...baseRule,
      trigger: {
        type: "webhook",
        config: {
          branch: "main",
          pathPattern: "**/*.yaml",
        },
      },
    };

    // Both match → trigger
    expect(
      shouldTrigger(rule, {
        branch: "main",
        changedFiles: ["api.yaml"],
        eventType: "push",
      }),
    ).toBe(true);

    // Branch matches, path doesn't → no trigger
    expect(
      shouldTrigger(rule, {
        branch: "main",
        changedFiles: ["src/app.ts"],
        eventType: "push",
      }),
    ).toBe(false);

    // Path matches, branch doesn't → no trigger
    expect(
      shouldTrigger(rule, {
        branch: "develop",
        changedFiles: ["api.yaml"],
        eventType: "push",
      }),
    ).toBe(false);
  });
});
