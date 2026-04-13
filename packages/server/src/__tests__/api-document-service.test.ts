/**
 * Tests for API Document routes — 路由接口测试
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  computeContentHash,
  getEndpointKey,
} from "../services/api-document-service.js";

// ── computeContentHash ────────────────────────────────

describe("computeContentHash", () => {
  it("相同内容应返回相同 hash", () => {
    const content = '{"openapi":"3.0.0","paths":{}}';
    const hash1 = computeContentHash(content);
    const hash2 = computeContentHash(content);
    expect(hash1).toBe(hash2);
  });

  it("不同内容应返回不同 hash", () => {
    const hash1 = computeContentHash("content A");
    const hash2 = computeContentHash("content B");
    expect(hash1).not.toBe(hash2);
  });

  it("应返回 64 字符的 SHA-256 hex", () => {
    const hash = computeContentHash("test");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});

// ── getEndpointKey ────────────────────────────────────

describe("getEndpointKey", () => {
  it("应将 method 大写", () => {
    expect(getEndpointKey("get", "/api/v1/users")).toBe("GET /api/v1/users");
  });

  it("应保留 path 原样", () => {
    expect(getEndpointKey("POST", "/pets/{id}/adopt")).toBe("POST /pets/{id}/adopt");
  });
});
