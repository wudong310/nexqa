/**
 * Tests for API Diff Service — OpenAPI spec comparison
 */

import { describe, it, expect } from "vitest";
import { diffOpenApiSpecs, parseOpenApiSpec } from "../services/api-diff-service.js";

describe("parseOpenApiSpec", () => {
  it("should parse valid JSON spec", () => {
    const spec = parseOpenApiSpec('{"openapi":"3.0.0","paths":{}}');
    expect(spec.openapi).toBe("3.0.0");
  });

  it("should throw on invalid JSON", () => {
    expect(() => parseOpenApiSpec("not json")).toThrow("Invalid OpenAPI spec");
  });
});

describe("diffOpenApiSpecs", () => {
  const baseSpec = {
    openapi: "3.0.0",
    paths: {
      "/api/users": {
        get: {
          summary: "List users",
          responses: {
            "200": {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: "Create user",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "email"],
                  properties: {
                    name: { type: "string" },
                    email: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      email: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/orders": {
        get: {
          summary: "List orders",
          parameters: [
            { name: "page", in: "query", required: false },
          ],
          responses: { "200": {} },
        },
      },
    },
  };

  it("should detect no changes for identical specs", () => {
    const result = diffOpenApiSpecs(baseSpec, baseSpec);
    expect(result.summary.added).toBe(0);
    expect(result.summary.removed).toBe(0);
    expect(result.summary.modified).toBe(0);
    expect(result.summary.breaking).toBe(0);
  });

  it("should detect added endpoint", () => {
    const newSpec = {
      ...baseSpec,
      paths: {
        ...baseSpec.paths,
        "/api/users/{id}/avatar": {
          patch: { summary: "Upload avatar" },
        },
      },
    };

    const result = diffOpenApiSpecs(baseSpec, newSpec);
    expect(result.summary.added).toBe(1);
    expect(result.added[0].method).toBe("PATCH");
    expect(result.added[0].path).toBe("/api/users/{id}/avatar");
  });

  it("should detect removed endpoint", () => {
    const newSpec = {
      openapi: "3.0.0",
      paths: {
        "/api/users": baseSpec.paths["/api/users"],
        // /api/orders removed
      },
    };

    const result = diffOpenApiSpecs(baseSpec, newSpec);
    expect(result.summary.removed).toBe(1);
    expect(result.removed[0].method).toBe("GET");
    expect(result.removed[0].path).toBe("/api/orders");
    expect(result.summary.breaking).toBeGreaterThanOrEqual(1);
  });

  it("should detect new required field as breaking change", () => {
    const newSpec = {
      ...baseSpec,
      paths: {
        ...baseSpec.paths,
        "/api/users": {
          ...baseSpec.paths["/api/users"],
          post: {
            summary: "Create user",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name", "email", "phone"],
                    properties: {
                      name: { type: "string" },
                      email: { type: "string" },
                      phone: { type: "string" },
                    },
                  },
                },
              },
            },
            responses: baseSpec.paths["/api/users"].post.responses,
          },
        },
      },
    };

    const result = diffOpenApiSpecs(baseSpec, newSpec);
    expect(result.summary.modified).toBeGreaterThanOrEqual(1);

    const postMod = result.modified.find(
      (m) => m.method === "POST" && m.path === "/api/users",
    );
    expect(postMod).toBeDefined();
    expect(postMod!.severity).toBe("breaking");

    // Should have a field change for the new required 'phone' field
    const phoneChange = postMod!.changes.find((c) => c.field.includes("phone"));
    expect(phoneChange).toBeDefined();
    expect(phoneChange!.breaking).toBe(true);
  });

  it("should detect non-breaking response field addition", () => {
    const newSpec = {
      ...baseSpec,
      paths: {
        ...baseSpec.paths,
        "/api/users": {
          ...baseSpec.paths["/api/users"],
          get: {
            summary: "List users",
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        avatar: { type: "string" }, // new field
                      },
                    },
                  },
                },
              },
            },
          },
          post: baseSpec.paths["/api/users"].post,
        },
      },
    };

    const result = diffOpenApiSpecs(baseSpec, newSpec);
    const getMod = result.modified.find(
      (m) => m.method === "GET" && m.path === "/api/users",
    );
    expect(getMod).toBeDefined();
    expect(getMod!.severity).toBe("non-breaking");

    const avatarChange = getMod!.changes.find((c) => c.field.includes("avatar"));
    expect(avatarChange).toBeDefined();
    expect(avatarChange!.breaking).toBe(false);
  });

  it("should detect added parameter", () => {
    const newSpec = {
      ...baseSpec,
      paths: {
        ...baseSpec.paths,
        "/api/orders": {
          get: {
            summary: "List orders",
            parameters: [
              { name: "page", in: "query", required: false },
              { name: "status", in: "query", required: true },
            ],
            responses: { "200": {} },
          },
        },
      },
    };

    const result = diffOpenApiSpecs(baseSpec, newSpec);
    const orderMod = result.modified.find(
      (m) => m.method === "GET" && m.path === "/api/orders",
    );
    expect(orderMod).toBeDefined();
    const statusChange = orderMod!.changes.find((c) => c.field.includes("status"));
    expect(statusChange).toBeDefined();
    expect(statusChange!.breaking).toBe(true); // required param is breaking
  });

  it("should handle empty specs", () => {
    const result = diffOpenApiSpecs(
      { openapi: "3.0.0", paths: {} },
      { openapi: "3.0.0", paths: {} },
    );
    expect(result.summary.added).toBe(0);
    expect(result.summary.removed).toBe(0);
    expect(result.summary.modified).toBe(0);
  });

  it("should handle spec with no paths property", () => {
    const result = diffOpenApiSpecs({ openapi: "3.0.0" }, { openapi: "3.0.0" });
    expect(result.summary.added).toBe(0);
  });
});
