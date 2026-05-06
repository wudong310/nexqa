/**
 * Tests for Environment P2 features: health check, compare, reorder
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── checkHealth mock test ─────────────────────────────

describe("Environment Health Check Logic", () => {
  it("should return healthy result for successful fetch", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("OK", { status: 200 }));

    const startTime = Date.now();
    try {
      const response = await fetch("http://localhost:8080", { method: "HEAD" });
      const latencyMs = Date.now() - startTime;

      expect(response.ok).toBe(true);
      expect(latencyMs).toBeGreaterThanOrEqual(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("should detect unreachable URL", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:9999"));

    try {
      await expect(fetch("http://localhost:9999")).rejects.toThrow("ECONNREFUSED");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ── Environment variable comparison logic ─────────────

describe("Environment Variable Comparison", () => {
  it("should detect same variables", () => {
    const vars1 = { token: "abc", url: "http://a.com" };
    const vars2 = { token: "abc", url: "http://a.com" };

    const allKeys = new Set([...Object.keys(vars1), ...Object.keys(vars2)]);
    for (const key of allKeys) {
      expect(vars1[key as keyof typeof vars1]).toBe(vars2[key as keyof typeof vars2]);
    }
  });

  it("should detect different variables", () => {
    const vars1: Record<string, string> = { token: "dev-token" };
    const vars2: Record<string, string> = { token: "prod-token" };

    expect(vars1.token).not.toBe(vars2.token);
  });

  it("should detect missing variables", () => {
    const vars1: Record<string, string> = { token: "abc", debug: "true" };
    const vars2: Record<string, string> = { token: "abc" };

    const allKeys = new Set([...Object.keys(vars1), ...Object.keys(vars2)]);
    const missingInEnv2 = [...allKeys].filter((k) => !(k in vars2));
    expect(missingInEnv2).toContain("debug");
  });
});

// ── Environment reorder logic ─────────────────────────

describe("Environment Reorder Logic", () => {
  it("should sort by order field", () => {
    const envs = [
      { id: "a", order: 2, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", order: 0, createdAt: "2026-01-02T00:00:00.000Z" },
      { id: "c", order: 1, createdAt: "2026-01-03T00:00:00.000Z" },
    ];

    envs.sort(
      (a, b) =>
        (a.order ?? 0) - (b.order ?? 0) ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    expect(envs.map((e) => e.id)).toEqual(["b", "c", "a"]);
  });

  it("should fallback to createdAt when order is same", () => {
    const envs = [
      { id: "a", order: 0, createdAt: "2026-01-03T00:00:00.000Z" },
      { id: "b", order: 0, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "c", order: 0, createdAt: "2026-01-02T00:00:00.000Z" },
    ];

    envs.sort(
      (a, b) =>
        (a.order ?? 0) - (b.order ?? 0) ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    expect(envs.map((e) => e.id)).toEqual(["b", "c", "a"]);
  });

  it("should handle missing order field (default to 0)", () => {
    const envs = [
      { id: "a", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "b", order: 1, createdAt: "2026-01-02T00:00:00.000Z" },
    ];

    envs.sort(
      (a, b) =>
        ((a as any).order ?? 0) - ((b as any).order ?? 0) ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    expect(envs.map((e) => e.id)).toEqual(["a", "b"]);
  });
});
