import { describe, expect, it } from "vitest";
import {
  detectFormat,
  parseApiDocument,
  type ParseResult,
} from "../services/api-parser.js";

// ─── detectFormat ────────────────────────────────────────────────

describe("detectFormat", () => {
  it("detects OpenAPI 3.x JSON", () => {
    const doc = JSON.stringify({ openapi: "3.0.3", info: { title: "Test" }, paths: {} });
    expect(detectFormat(doc)).toBe("openapi3");
  });

  it("detects OpenAPI 3.1 JSON", () => {
    const doc = JSON.stringify({ openapi: "3.1.0", info: { title: "Test" }, paths: {} });
    expect(detectFormat(doc)).toBe("openapi3");
  });

  it("detects OpenAPI 3.x YAML", () => {
    const yaml = `openapi: "3.0.2"\ninfo:\n  title: Test\npaths: {}`;
    expect(detectFormat(yaml)).toBe("openapi3");
  });

  it("detects Swagger 2.0 JSON", () => {
    const doc = JSON.stringify({ swagger: "2.0", info: { title: "Test" }, paths: {} });
    expect(detectFormat(doc)).toBe("swagger2");
  });

  it("detects Swagger 2.0 YAML", () => {
    const yaml = `swagger: "2.0"\ninfo:\n  title: Test\npaths: {}`;
    expect(detectFormat(yaml)).toBe("swagger2");
  });

  it("detects Postman Collection v2", () => {
    const doc = JSON.stringify({
      info: { name: "Test", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
      item: [],
    });
    expect(detectFormat(doc)).toBe("postman-v2");
  });

  it("detects HAR", () => {
    const doc = JSON.stringify({ log: { version: "1.2", entries: [] } });
    expect(detectFormat(doc)).toBe("har");
  });

  it("detects cURL", () => {
    expect(detectFormat("curl https://api.example.com/users")).toBe("curl");
  });

  it("returns unknown for unrecognized content", () => {
    expect(detectFormat("hello world")).toBe("unknown");
  });

  it("returns unknown for empty content", () => {
    expect(detectFormat("")).toBe("unknown");
  });
});

// ─── OpenAPI 3.x ─────────────────────────────────────────────────

describe("parseApiDocument — OpenAPI 3.x", () => {
  const openapi3Doc = JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Pet Store", version: "1.0.0" },
    paths: {
      "/pets": {
        get: {
          summary: "List all pets",
          parameters: [
            { name: "limit", in: "query", required: false, schema: { type: "integer" } },
          ],
          responses: {
            "200": { description: "A list of pets" },
          },
        },
        post: {
          summary: "Create a pet",
          requestBody: {
            content: {
              "application/json": {
                schema: { type: "object" },
                example: { name: "doggo" },
              },
            },
          },
          responses: {
            "201": { description: "Created" },
          },
        },
      },
      "/pets/{petId}": {
        get: {
          summary: "Get pet by ID",
          parameters: [
            { name: "petId", in: "path", required: true, schema: { type: "string" } },
            { name: "Authorization", in: "header", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "OK" },
            "404": { description: "Not found" },
          },
        },
      },
    },
  });

  it("parses format correctly", () => {
    const result = parseApiDocument(openapi3Doc);
    expect(result.format).toBe("openapi3");
  });

  it("extracts all endpoints", () => {
    const result = parseApiDocument(openapi3Doc);
    expect(result.endpoints).toHaveLength(3);
  });

  it("parses GET /pets with query params", () => {
    const result = parseApiDocument(openapi3Doc);
    const getPets = result.endpoints.find((e) => e.method === "GET" && e.path === "/pets");
    expect(getPets).toBeDefined();
    expect(getPets!.summary).toBe("List all pets");
    expect(getPets!.queryParams).toHaveLength(1);
    expect(getPets!.queryParams[0].name).toBe("limit");
    expect(getPets!.responses).toHaveLength(1);
    expect(getPets!.responses[0].status).toBe(200);
  });

  it("parses POST /pets with request body", () => {
    const result = parseApiDocument(openapi3Doc);
    const postPets = result.endpoints.find((e) => e.method === "POST" && e.path === "/pets");
    expect(postPets).toBeDefined();
    expect(postPets!.body).toBeDefined();
    expect(postPets!.body!.contentType).toBe("application/json");
    expect(postPets!.body!.example).toEqual({ name: "doggo" });
  });

  it("parses path params and headers", () => {
    const result = parseApiDocument(openapi3Doc);
    const getPet = result.endpoints.find((e) => e.path === "/pets/{petId}");
    expect(getPet).toBeDefined();
    expect(getPet!.pathParams).toHaveLength(1);
    expect(getPet!.pathParams[0].name).toBe("petId");
    expect(getPet!.headers).toHaveLength(1);
    expect(getPet!.headers[0].name).toBe("Authorization");
  });
});

// ─── Swagger 2.0 ─────────────────────────────────────────────────

describe("parseApiDocument — Swagger 2.0", () => {
  const swagger2Doc = JSON.stringify({
    swagger: "2.0",
    info: { title: "User API", version: "1.0" },
    consumes: ["application/json"],
    paths: {
      "/users": {
        get: {
          summary: "List users",
          parameters: [
            { name: "page", in: "query", type: "integer", required: false },
          ],
          responses: { "200": { description: "OK" } },
        },
        post: {
          summary: "Create user",
          parameters: [
            { name: "body", in: "body", schema: { type: "object", example: { name: "alice" } } },
          ],
          responses: { "201": { description: "Created" } },
        },
      },
    },
  });

  it("parses format correctly", () => {
    const result = parseApiDocument(swagger2Doc);
    expect(result.format).toBe("swagger2");
  });

  it("extracts endpoints", () => {
    const result = parseApiDocument(swagger2Doc);
    expect(result.endpoints).toHaveLength(2);
  });

  it("parses body parameter", () => {
    const result = parseApiDocument(swagger2Doc);
    const post = result.endpoints.find((e) => e.method === "POST");
    expect(post).toBeDefined();
    expect(post!.body).toBeDefined();
    expect(post!.body!.contentType).toBe("application/json");
    expect(post!.body!.example).toEqual({ name: "alice" });
  });

  it("parses query parameter", () => {
    const result = parseApiDocument(swagger2Doc);
    const get = result.endpoints.find((e) => e.method === "GET");
    expect(get!.queryParams).toHaveLength(1);
    expect(get!.queryParams[0].name).toBe("page");
  });
});

// ─── Postman Collection v2 ───────────────────────────────────────

describe("parseApiDocument — Postman Collection v2", () => {
  const postmanDoc = JSON.stringify({
    info: {
      name: "Test Collection",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: [
      {
        name: "Get Users",
        request: {
          method: "GET",
          url: {
            raw: "https://api.example.com/users?limit=10",
            path: ["users"],
            query: [{ key: "limit", value: "10" }],
          },
          header: [
            { key: "Authorization", value: "Bearer token123" },
          ],
        },
      },
      {
        name: "Auth Folder",
        item: [
          {
            name: "Login",
            request: {
              method: "POST",
              url: { raw: "https://api.example.com/auth/login", path: ["auth", "login"] },
              body: {
                mode: "raw",
                raw: '{"username":"admin","password":"123"}',
              },
            },
          },
        ],
      },
    ],
  });

  it("parses format correctly", () => {
    const result = parseApiDocument(postmanDoc);
    expect(result.format).toBe("postman-v2");
  });

  it("extracts endpoints including nested folders", () => {
    const result = parseApiDocument(postmanDoc);
    expect(result.endpoints).toHaveLength(2);
  });

  it("parses GET request with headers and query params", () => {
    const result = parseApiDocument(postmanDoc);
    const get = result.endpoints.find((e) => e.method === "GET");
    expect(get).toBeDefined();
    expect(get!.path).toBe("/users");
    expect(get!.headers).toHaveLength(1);
    expect(get!.queryParams).toHaveLength(1);
  });

  it("parses POST with body from nested folder", () => {
    const result = parseApiDocument(postmanDoc);
    const post = result.endpoints.find((e) => e.method === "POST");
    expect(post).toBeDefined();
    expect(post!.path).toBe("/auth/login");
    expect(post!.body).toBeDefined();
    expect(post!.body!.example).toEqual({ username: "admin", password: "123" });
  });
});

// ─── HAR ─────────────────────────────────────────────────────────

describe("parseApiDocument — HAR", () => {
  const harDoc = JSON.stringify({
    log: {
      version: "1.2",
      entries: [
        {
          request: {
            method: "GET",
            url: "https://api.example.com/items?page=1",
            headers: [
              { name: "Accept", value: "application/json" },
              { name: "Host", value: "api.example.com" },
            ],
            queryString: [{ name: "page", value: "1" }],
          },
          response: { status: 200, statusText: "OK" },
        },
        {
          request: {
            method: "POST",
            url: "https://api.example.com/items",
            headers: [],
            postData: {
              mimeType: "application/json",
              text: '{"name":"item1"}',
            },
          },
          response: { status: 201, statusText: "Created" },
        },
        // Duplicate — should be deduped
        {
          request: {
            method: "GET",
            url: "https://api.example.com/items?page=2",
            headers: [],
            queryString: [{ name: "page", value: "2" }],
          },
          response: { status: 200, statusText: "OK" },
        },
      ],
    },
  });

  it("parses format correctly", () => {
    const result = parseApiDocument(harDoc);
    expect(result.format).toBe("har");
  });

  it("extracts endpoints with deduplication", () => {
    const result = parseApiDocument(harDoc);
    // GET /items appears twice but should be deduped
    expect(result.endpoints).toHaveLength(2);
  });

  it("filters out Host header", () => {
    const result = parseApiDocument(harDoc);
    const get = result.endpoints.find((e) => e.method === "GET");
    expect(get!.headers.find((h) => h.name === "Host")).toBeUndefined();
  });

  it("parses POST body", () => {
    const result = parseApiDocument(harDoc);
    const post = result.endpoints.find((e) => e.method === "POST");
    expect(post).toBeDefined();
    expect(post!.body).toBeDefined();
    expect(post!.body!.example).toEqual({ name: "item1" });
  });

  it("extracts response status", () => {
    const result = parseApiDocument(harDoc);
    const post = result.endpoints.find((e) => e.method === "POST");
    expect(post!.responses).toHaveLength(1);
    expect(post!.responses[0].status).toBe(201);
  });
});

// ─── cURL ────────────────────────────────────────────────────────

describe("parseApiDocument — cURL", () => {
  it("parses simple GET", () => {
    const result = parseApiDocument("curl https://api.example.com/users");
    expect(result.format).toBe("curl");
    expect(result.endpoints).toHaveLength(1);
    expect(result.endpoints[0].method).toBe("GET");
    expect(result.endpoints[0].path).toBe("/users");
  });

  it("parses POST with headers and body", () => {
    const cmd = `curl -X POST https://api.example.com/users -H 'Content-Type: application/json' -H 'Authorization: Bearer token' -d '{"name":"alice"}'`;
    const result = parseApiDocument(cmd);
    expect(result.format).toBe("curl");
    expect(result.endpoints).toHaveLength(1);
    const ep = result.endpoints[0];
    expect(ep.method).toBe("POST");
    expect(ep.path).toBe("/users");
    expect(ep.headers).toHaveLength(2);
    expect(ep.body).toBeDefined();
    expect(ep.body!.example).toEqual({ name: "alice" });
  });

  it("parses multiline curl with backslash continuation", () => {
    const cmd = `curl -X PUT \\\n  https://api.example.com/users/1 \\\n  -H 'Content-Type: application/json' \\\n  -d '{"name":"bob"}'`;
    const result = parseApiDocument(cmd);
    expect(result.format).toBe("curl");
    expect(result.endpoints).toHaveLength(1);
    const ep = result.endpoints[0];
    expect(ep.method).toBe("PUT");
    expect(ep.path).toBe("/users/1");
    expect(ep.body!.example).toEqual({ name: "bob" });
  });

  it("infers POST when body present without -X", () => {
    const cmd = `curl https://api.example.com/data -d '{"key":"val"}'`;
    const result = parseApiDocument(cmd);
    expect(result.endpoints[0].method).toBe("POST");
  });
});

// ─── Unknown format ──────────────────────────────────────────────

describe("parseApiDocument — unknown", () => {
  it("returns unknown for plain text", () => {
    const result = parseApiDocument("This is just some random text");
    expect(result.format).toBe("unknown");
    expect(result.endpoints).toHaveLength(0);
    expect(result.errors).toBeDefined();
  });

  it("returns unknown for empty string", () => {
    const result = parseApiDocument("");
    expect(result.format).toBe("unknown");
  });
});
