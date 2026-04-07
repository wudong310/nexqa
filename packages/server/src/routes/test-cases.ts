import type { Settings, TestCase } from "@nexqa/shared";
import { TestCaseTagsSchema } from "@nexqa/shared";
import { streamText } from "ai";
import { Hono } from "hono";
import { v4 as uuid } from "uuid";
import {
  GENERATE_TEST_CASES_SYSTEM,
  buildGenerateUserPrompt,
} from "../prompts/index.js";
import { createLlmModel } from "../services/llm.js";
import { createLogger } from "../services/logger.js";
import { storage } from "../services/storage.js";

const COLLECTION = "test-cases";

/** Validate and normalise tags — handles undefined, partial objects, and simplified {type,priority,labels} format */
export function normaliseTags(raw: unknown): import("@nexqa/shared").TestCaseTags {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;

    // Detect simplified API format: has `type` field (not a structured tags field)
    // Must check BEFORE safeParse since Zod strips unknown keys and applies defaults
    if ("type" in obj && typeof obj.type === "string" && !("strategy" in obj)) {
      const typeToStrategy: Record<string, string> = {
        positive: "positive",
        negative: "negative",
        boundary: "boundary",
        destructive: "destructive",
      };
      const mapped: Record<string, unknown> = {};

      const strategy = typeToStrategy[obj.type];
      if (strategy) {
        mapped.strategy = [strategy];
      }

      // Carry over priority if valid
      if (typeof obj.priority === "string") {
        mapped.priority = obj.priority;
      }

      // Carry over any structured fields that may coexist
      if (obj.purpose) mapped.purpose = obj.purpose;
      if (obj.phase) mapped.phase = obj.phase;

      const retryParsed = TestCaseTagsSchema.safeParse(mapped);
      if (retryParsed.success) return retryParsed.data;
    }

    // Try Zod parse for structured tags (purpose/strategy/phase/priority)
    const parsed = TestCaseTagsSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
  }

  // Fallback to default
  return { purpose: ["functional"], strategy: ["positive"], phase: ["full"], priority: "P1" };
}

export const testCaseRoutes = new Hono()
  .get("/", async (c) => {
    const endpointId = c.req.query("endpointId");
    const projectId = c.req.query("projectId");
    const cases = await storage.list<TestCase>(COLLECTION);
    let filtered = cases;
    if (endpointId) {
      filtered = filtered.filter((tc) => tc.endpointId === endpointId);
    }
    if (projectId) {
      const endpoints = (
        await storage.list<{ id: string; projectId: string }>("api-endpoints")
      ).filter((ep) => ep.projectId === projectId);
      const epIds = new Set(endpoints.map((ep) => ep.id));
      filtered = filtered.filter((tc) => epIds.has(tc.endpointId));
    }
    return c.json(filtered);
  })
  .post("/", async (c) => {
    const body = await c.req.json();
    const now = new Date().toISOString();
    const tc: TestCase = {
      id: uuid(),
      endpointId: body.endpointId,
      name: body.name,
      request: body.request,
      expected: body.expected || {
        status: null,
        bodyContains: null,
        bodySchema: null,
      },
      tags: normaliseTags(body.tags),
      createdAt: now,
      updatedAt: now,
    };
    await storage.write(COLLECTION, tc.id, tc);
    return c.json(tc, 201);
  })
  .post("/update", async (c) => {
    const body = await c.req.json();
    const { id, ...rest } = body;
    if (!id) return c.json({ error: "id is required" }, 400);
    const existing = await storage.read<TestCase>(COLLECTION, id);
    if (!existing) return c.json({ error: "Test case not found" }, 404);
    // Normalise tags if present in the update payload
    if (rest.tags !== undefined) {
      rest.tags = normaliseTags(rest.tags);
    }
    const updated: TestCase = {
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
    await storage.remove(COLLECTION, id);
    return c.json({ success: true });
  })
  .post("/generate", async (c) => {
    const log = createLogger("test-cases", c.req.header("x-trace-id"));
    log.info("开始生成测试用例");
    const raw = await storage.readRaw("settings.json");
    if (!raw) {
      log.error("LLM 未配置");
      return c.json({ error: "LLM not configured" }, 400);
    }
    const settings = JSON.parse(raw) as Settings;
    if (!settings.llm) {
      log.error("LLM 未配置");
      return c.json({ error: "LLM not configured" }, 400);
    }

    const { endpoints, tags: strategies, preview, purposes, isolationRule } = await c.req.json<{
      endpoints: unknown[];
      tags?: string[];
      preview?: boolean;
      purposes?: string[];
      isolationRule?: boolean;
    }>();
    log.info(`接口数量: ${endpoints.length}${strategies?.length ? `, 指定策略: ${strategies.join(",")}` : ""}${purposes?.length ? `, 测试目的: ${purposes.join(",")}` : ""}${isolationRule ? ", 数据隔离: ON" : ""}${preview ? ", 预览模式" : ""}`);
    const model = createLlmModel(settings.llm);

    const result = streamText({
      model,
      maxTokens: 16384,
      system: GENERATE_TEST_CASES_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildGenerateUserPrompt(endpoints, {
            tags: strategies?.length ? { strategy: strategies } : undefined,
            purposes,
            isolationRule,
          }),
        },
      ],
    });

    log.info("开始流式返回生成结果");

    // preview 模式：通过自定义 header 告知前端这是预览，不应自动写入
    if (preview) {
      c.header("x-preview", "true");
    }

    return result.toDataStreamResponse();
  });
