import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeFetch } from "../services/safe-fetch.js";

// Mock logger to suppress output during tests
vi.mock("../services/logger.js", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

/** Helper: create a minimal Response with given status and headers */
function mockResponse(
  status: number,
  headers: Record<string, string> = {},
  body = "",
): Response {
  return new Response(body, {
    status,
    headers: new Headers(headers),
  });
}

describe("safeFetch", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Replace global fetch with a mock
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ---------- 正常请求（无重定向）----------

  it("should return response directly for non-redirect status", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(mockResponse(200, {}, "OK"));

    const res = await safeFetch("https://example.com/api");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify redirect: "manual" is set
    const callInit = mockFetch.mock.calls[0][1] as RequestInit;
    expect(callInit.redirect).toBe("manual");
  });

  // ---------- 301 重定向 ----------

  describe("301 redirect", () => {
    it("should follow 301 and change method to GET, discard body", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);

      // First call: 301 redirect
      mockFetch.mockResolvedValueOnce(
        mockResponse(301, { location: "https://example.com/new-path" }),
      );
      // Second call: final response
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}, "redirected"));

      const res = await safeFetch("https://example.com/old-path", {
        method: "POST",
        body: JSON.stringify({ data: "test" }),
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status).toBe(200);
      expect(await res.text()).toBe("redirected");
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify second call uses GET without body
      const secondCallInit = mockFetch.mock.calls[1][1] as RequestInit;
      expect(secondCallInit.method).toBe("GET");
      expect(secondCallInit.body).toBeUndefined();
    });
  });

  // ---------- 302 重定向 ----------

  describe("302 redirect", () => {
    it("should follow 302 and change method to GET, discard body", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);

      mockFetch.mockResolvedValueOnce(
        mockResponse(302, { location: "https://example.com/new" }),
      );
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}, "found"));

      const res = await safeFetch("https://example.com/old", {
        method: "PUT",
        body: "update-data",
      });

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const secondCallInit = mockFetch.mock.calls[1][1] as RequestInit;
      expect(secondCallInit.method).toBe("GET");
      expect(secondCallInit.body).toBeUndefined();
    });
  });

  // ---------- 307 重定向 ----------

  describe("307 redirect", () => {
    it("should follow 307 and preserve original method and body", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      const bodyContent = JSON.stringify({ data: "important" });

      mockFetch.mockResolvedValueOnce(
        mockResponse(307, { location: "https://example.com/temp-new" }),
      );
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}, "preserved"));

      const res = await safeFetch("https://example.com/temp-old", {
        method: "POST",
        body: bodyContent,
      });

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify method and body are preserved
      const secondCallInit = mockFetch.mock.calls[1][1] as RequestInit;
      expect(secondCallInit.method).toBe("POST");
      expect(secondCallInit.body).toBe(bodyContent);
    });
  });

  // ---------- 308 重定向 ----------

  describe("308 redirect", () => {
    it("should follow 308 and preserve original method and body", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      const bodyContent = "patch-data";

      mockFetch.mockResolvedValueOnce(
        mockResponse(308, { location: "https://example.com/perm-new" }),
      );
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}, "done"));

      const res = await safeFetch("https://example.com/perm-old", {
        method: "PATCH",
        body: bodyContent,
      });

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      const secondCallInit = mockFetch.mock.calls[1][1] as RequestInit;
      expect(secondCallInit.method).toBe("PATCH");
      expect(secondCallInit.body).toBe(bodyContent);
    });
  });

  // ---------- 链式重定向 A→B→C ----------

  describe("chained redirects", () => {
    it("should follow multiple redirects A→B→C", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);

      // A → B
      mockFetch.mockResolvedValueOnce(
        mockResponse(301, { location: "https://example.com/b" }),
      );
      // B → C
      mockFetch.mockResolvedValueOnce(
        mockResponse(302, { location: "https://example.com/c" }),
      );
      // C → final
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}, "final"));

      const res = await safeFetch("https://example.com/a");
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("final");
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Verify URL chain
      expect(mockFetch.mock.calls[0][0]).toBe("https://example.com/a");
      expect(mockFetch.mock.calls[1][0]).toBe("https://example.com/b");
      expect(mockFetch.mock.calls[2][0]).toBe("https://example.com/c");
    });

    it("should handle mixed 307→301 redirect chain (preserve then downgrade)", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      const body = "post-data";

      // 307: preserve method+body
      mockFetch.mockResolvedValueOnce(
        mockResponse(307, { location: "https://example.com/step2" }),
      );
      // 301: downgrade to GET
      mockFetch.mockResolvedValueOnce(
        mockResponse(301, { location: "https://example.com/step3" }),
      );
      // Final
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}, "done"));

      const res = await safeFetch("https://example.com/step1", {
        method: "POST",
        body,
      });

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // step2: should preserve POST + body (307)
      const step2Init = mockFetch.mock.calls[1][1] as RequestInit;
      expect(step2Init.method).toBe("POST");
      expect(step2Init.body).toBe(body);

      // step3: should downgrade to GET (301)
      const step3Init = mockFetch.mock.calls[2][1] as RequestInit;
      expect(step3Init.method).toBe("GET");
      expect(step3Init.body).toBeUndefined();
    });
  });

  // ---------- 超过最大重定向次数 ----------

  describe("max redirects exceeded", () => {
    it("should return last response after exceeding maxRedirects (default 10)", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);

      // 11 redirects (1 initial + 10 redirects = 11 calls, then the 11th redirect is over the limit)
      for (let i = 0; i <= 10; i++) {
        mockFetch.mockResolvedValueOnce(
          mockResponse(301, {
            location: `https://example.com/redirect-${i + 1}`,
          }),
        );
      }

      const res = await safeFetch("https://example.com/start");

      // After 10 redirects, should return the 11th redirect response (the one that exceeds limit)
      expect(res.status).toBe(301);
      // 1 initial + 10 redirects = 11 fetch calls
      expect(mockFetch).toHaveBeenCalledTimes(11);
    });

    it("should respect custom maxRedirects", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);

      // Set maxRedirects=2, provide 3 redirects
      for (let i = 0; i < 3; i++) {
        mockFetch.mockResolvedValueOnce(
          mockResponse(302, {
            location: `https://example.com/r${i + 1}`,
          }),
        );
      }

      const res = await safeFetch("https://example.com/start", {
        maxRedirects: 2,
      });

      // Should stop after 2 redirects and return the 3rd redirect response
      expect(res.status).toBe(302);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  // ---------- 相对路径 location header ----------

  describe("relative location header", () => {
    it("should resolve relative path location against current URL", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);

      mockFetch.mockResolvedValueOnce(
        mockResponse(301, { location: "/new-path" }),
      );
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}, "resolved"));

      const res = await safeFetch("https://example.com/old-path");
      expect(res.status).toBe(200);

      // Second call should be to absolute URL resolved from relative path
      expect(mockFetch.mock.calls[1][0]).toBe("https://example.com/new-path");
    });

    it("should resolve relative path with base path context", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);

      mockFetch.mockResolvedValueOnce(
        mockResponse(302, { location: "../other/resource" }),
      );
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}, "ok"));

      const res = await safeFetch("https://example.com/api/v1/endpoint");
      expect(res.status).toBe(200);

      // ../other/resource relative to /api/v1/endpoint → /api/other/resource
      expect(mockFetch.mock.calls[1][0]).toBe(
        "https://example.com/api/other/resource",
      );
    });
  });

  // ---------- Query params 合并保留 ----------

  describe("query params preservation", () => {
    it("should preserve original query params when redirect URL has no query", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);

      mockFetch.mockResolvedValueOnce(
        mockResponse(301, { location: "https://example.com/new" }),
      );
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}, "ok"));

      await safeFetch("https://example.com/old?foo=bar&baz=qux");

      // Redirect URL should have original query params appended
      expect(mockFetch.mock.calls[1][0]).toBe(
        "https://example.com/new?foo=bar&baz=qux",
      );
    });

    it("should keep redirect URL's own query params if present", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);

      mockFetch.mockResolvedValueOnce(
        mockResponse(301, {
          location: "https://example.com/new?token=abc",
        }),
      );
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}, "ok"));

      await safeFetch("https://example.com/old?foo=bar");

      // Redirect URL has its own query, so original query is NOT merged
      expect(mockFetch.mock.calls[1][0]).toBe(
        "https://example.com/new?token=abc",
      );
    });
  });

  // ---------- HTTP→HTTPS 自动升级 ----------

  describe("forceHttps", () => {
    it("should upgrade http to https when forceHttps is true", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}, "secure"));

      await safeFetch("http://example.com/api", { forceHttps: true });

      expect(mockFetch.mock.calls[0][0]).toBe("https://example.com/api");
    });

    it("should not modify https URLs when forceHttps is true", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}, "ok"));

      await safeFetch("https://example.com/api", { forceHttps: true });

      expect(mockFetch.mock.calls[0][0]).toBe("https://example.com/api");
    });

    it("should not upgrade http to https when forceHttps is false (default)", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}, "ok"));

      await safeFetch("http://example.com/api");

      expect(mockFetch.mock.calls[0][0]).toBe("http://example.com/api");
    });
  });

  // ---------- 超时控制 ----------

  describe("timeout", () => {
    it("should pass AbortSignal.timeout with specified timeout value", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}, "ok"));

      await safeFetch("https://example.com/api", { timeout: 5000 });

      const callInit = mockFetch.mock.calls[0][1] as RequestInit;
      // Verify signal is set (AbortSignal.timeout returns an AbortSignal)
      expect(callInit.signal).toBeDefined();
      expect(callInit.signal).toBeInstanceOf(AbortSignal);
    });

    it("should use default 30s timeout when not specified", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}, "ok"));

      await safeFetch("https://example.com/api");

      const callInit = mockFetch.mock.calls[0][1] as RequestInit;
      expect(callInit.signal).toBeDefined();
      expect(callInit.signal).toBeInstanceOf(AbortSignal);
    });

    it("should abort when fetch exceeds timeout", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      // Simulate a slow fetch that respects AbortSignal
      mockFetch.mockImplementationOnce(
        (_url: string | URL | Request, init?: RequestInit) => {
          return new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (signal) {
              // If already aborted, reject immediately
              if (signal.aborted) {
                reject(signal.reason);
                return;
              }
              signal.addEventListener("abort", () => {
                reject(signal.reason);
              });
            }
            // Never resolve — simulate infinite hang
          });
        },
      );

      await expect(
        safeFetch("https://example.com/slow", { timeout: 50 }),
      ).rejects.toThrow();
    });
  });

  // ---------- 无 location header 的重定向响应 ----------

  describe("edge cases", () => {
    it("should return redirect response as-is when location header is missing", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce(mockResponse(301));

      const res = await safeFetch("https://example.com/no-location");
      expect(res.status).toBe(301);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should default method to GET when not specified", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);

      mockFetch.mockResolvedValueOnce(
        mockResponse(307, { location: "https://example.com/new" }),
      );
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}, "ok"));

      await safeFetch("https://example.com/old");

      // 307 should preserve method, default is GET
      const secondCallInit = mockFetch.mock.calls[1][1] as RequestInit;
      expect(secondCallInit.method).toBe("GET");
    });

    it("should handle 303 redirect (always downgrade to GET)", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);

      mockFetch.mockResolvedValueOnce(
        mockResponse(303, { location: "https://example.com/see-other" }),
      );
      mockFetch.mockResolvedValueOnce(mockResponse(200, {}, "other"));

      const res = await safeFetch("https://example.com/post-action", {
        method: "POST",
        body: "some-data",
      });

      expect(res.status).toBe(200);
      const secondCallInit = mockFetch.mock.calls[1][1] as RequestInit;
      expect(secondCallInit.method).toBe("GET");
      expect(secondCallInit.body).toBeUndefined();
    });
  });
});
