/**
 * Source Scanner 单元测试
 *
 * 覆盖：
 * - extractJson: 纯 JSON / markdown 代码块 / 带前后缀文本 / 无效 JSON
 */

import { describe, it, expect } from "vitest";
import { extractJson } from "../services/source-scanner.js";

// ── extractJson ───────────────────────────────────────────────────────────────

describe("extractJson", () => {
  it("should parse pure JSON array", () => {
    const input = '[{"method":"GET","path":"/api/users"}]';
    const result = extractJson(input);
    expect(result).toEqual([{ method: "GET", path: "/api/users" }]);
  });

  it("should parse pure JSON object (wrap in array)", () => {
    const input = '{"method":"POST","path":"/api/items"}';
    const result = extractJson(input);
    expect(result).toEqual([{ method: "POST", path: "/api/items" }]);
  });

  it("should extract JSON from markdown code block (```json)", () => {
    const input = `Here are the endpoints:

\`\`\`json
[{"method":"GET","path":"/api/users"},{"method":"POST","path":"/api/users"}]
\`\`\`

That's all.`;
    const result = extractJson(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ method: "GET", path: "/api/users" });
    expect(result[1]).toMatchObject({ method: "POST", path: "/api/users" });
  });

  it("should extract JSON from markdown code block (``` without lang)", () => {
    const input = `Here's the result:

\`\`\`
[{"method":"DELETE","path":"/api/items/:id"}]
\`\`\``;
    const result = extractJson(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ method: "DELETE", path: "/api/items/:id" });
  });

  it("should extract JSON from text with prefix and suffix", () => {
    const input = `I found the following endpoints:
[{"method":"PUT","path":"/api/config"}]
Hope this helps!`;
    const result = extractJson(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ method: "PUT", path: "/api/config" });
  });

  it("should extract single object from text with prefix/suffix", () => {
    const input = `Result: {"method":"PATCH","path":"/api/profile"} done.`;
    const result = extractJson(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ method: "PATCH", path: "/api/profile" });
  });

  it("should return empty array for completely invalid input", () => {
    const result = extractJson("This is not JSON at all, no brackets or braces");
    expect(result).toEqual([]);
  });

  it("should return empty array for malformed JSON", () => {
    const result = extractJson("[{invalid json content}]");
    expect(result).toEqual([]);
  });

  it("should handle empty string", () => {
    const result = extractJson("");
    expect(result).toEqual([]);
  });

  it("should handle nested JSON with whitespace", () => {
    const input = `
    [
      {
        "method": "GET",
        "path": "/api/health",
        "summary": "Health check",
        "queryParams": [],
        "pathParams": [],
        "headers": [],
        "body": null,
        "responses": [{"status": 200, "description": "OK"}],
        "confidence": "high"
      }
    ]
    `;
    const result = extractJson(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      method: "GET",
      path: "/api/health",
      summary: "Health check",
    });
  });
});


