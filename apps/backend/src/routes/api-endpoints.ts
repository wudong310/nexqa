import type { ApiEndpoint, Endpoint } from "@nexqa/shared";
import { Hono } from "hono";
import { v4 as uuid } from "uuid";
import { parseApiDocument } from "../services/api-parser.js";
import { createLogger } from "../services/logger.js";
import { storage } from "../services/storage.js";

const COLLECTION = "api-endpoints";

export const apiEndpointRoutes = new Hono()
  .get("/", async (c) => {
    const projectId = c.req.query("projectId");
    const documentId = c.req.query("documentId");
    const all = await storage.list<ApiEndpoint>(COLLECTION);
    let filtered = projectId
      ? all.filter((ep) => ep.projectId === projectId)
      : all;
    if (documentId) {
      filtered = filtered.filter((ep) => ep.documentId === documentId);
    }
    filtered.sort((a, b) => {
      const cmp = a.path.localeCompare(b.path);
      if (cmp !== 0) return cmp;
      return a.method.localeCompare(b.method);
    });
    return c.json(filtered);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const ep = await storage.read<ApiEndpoint>(COLLECTION, id);
    if (!ep) return c.json({ error: "端点不存在" }, 404);
    const allCases = await storage.list<{ id: string; name: string; endpointId: string | null; apiChangeFlag?: unknown }>("test-cases");
    const testCases = allCases
      .filter((tc) => tc.endpointId === id)
      .map((tc) => ({ id: tc.id, name: tc.name, apiChangeFlag: tc.apiChangeFlag ?? null }));
    return c.json({ ...ep, testCases });
  })
  .post("/import", async (c) => {
    const { projectId, endpoints } = await c.req.json<{
      projectId: string;
      endpoints: Endpoint[];
    }>();
    const existing = (await storage.list<ApiEndpoint>(COLLECTION)).filter(
      (ep) => ep.projectId === projectId,
    );
    const existingMap = new Map<string, ApiEndpoint>();
    for (const ep of existing) {
      existingMap.set(`${ep.method} ${ep.path}`, ep);
    }

    const results: ApiEndpoint[] = [];
    const now = new Date().toISOString();
    for (const ep of endpoints) {
      const key = `${ep.method} ${ep.path}`;
      const found = existingMap.get(key);
      if (found) {
        const merged: ApiEndpoint = {
          ...found,
          summary: ep.summary || found.summary,
          headers: ep.headers.length > 0 ? ep.headers : found.headers,
          queryParams:
            ep.queryParams.length > 0 ? ep.queryParams : found.queryParams,
          pathParams:
            ep.pathParams.length > 0 ? ep.pathParams : found.pathParams,
          body: ep.body || found.body,
          responses: ep.responses.length > 0 ? ep.responses : found.responses,
          updatedAt: now,
        };
        await storage.write(COLLECTION, found.id, merged);
        results.push(merged);
      } else {
        const newEp: ApiEndpoint = {
          id: uuid(),
          projectId,
          documentId: null,
          method: ep.method,
          path: ep.path,
          summary: ep.summary,
          headers: ep.headers,
          queryParams: ep.queryParams,
          pathParams: ep.pathParams,
          body: ep.body,
          responses: ep.responses,
          createdAt: now,
          updatedAt: now,
        };
        await storage.write(COLLECTION, newEp.id, newEp);
        results.push(newEp);
      }
    }
    return c.json(results, 201);
  })
  .post("/update", async (c) => {
    const body = await c.req.json();
    const { id, ...rest } = body;
    if (!id) return c.json({ error: "id is required" }, 400);
    const existing = await storage.read<ApiEndpoint>(COLLECTION, id);
    if (!existing) return c.json({ error: "Endpoint not found" }, 404);
    const updated: ApiEndpoint = {
      ...existing,
      ...rest,
      id,
      updatedAt: new Date().toISOString(),
    };
    await storage.write(COLLECTION, id, updated);
    return c.json(updated);
  })
  .post("/delete", async (c) => {
    const { id } = await c.req.json();
    if (!id) return c.json({ error: "id is required" }, 400);
    const cases = (
      await storage.list<{ id: string; endpointId: string }>("test-cases")
    ).filter((tc) => tc.endpointId === id);
    for (const tc of cases) {
      await storage.remove("test-cases", tc.id);
    }
    await storage.remove(COLLECTION, id);
    return c.json({ success: true });
  })
  .post("/parse", async (c) => {
    const log = createLogger("api-endpoints", c.req.header("x-trace-id"));
    log.info("开始解析 API 文档");

    const { content } = await c.req.json<{ content: string }>();
    if (!content || typeof content !== "string" || !content.trim()) {
      return c.json({ error: "content 不能为空" }, 400);
    }
    log.info("文档内容长度", content.length);

    const result = parseApiDocument(content);

    if (result.format === "unknown") {
      log.warn("无法识别的格式");
      return c.json(
        {
          error:
            "不支持的格式。支持：OpenAPI 3.x、Swagger 2.0、Postman Collection、HAR、cURL",
        },
        400,
      );
    }

    log.info(`识别格式: ${result.format}, 解析到 ${result.endpoints.length} 个端点`);
    return c.json(result);
  });
