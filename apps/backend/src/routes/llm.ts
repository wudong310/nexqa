import type { LlmConfig, Settings } from "@nexqa/shared";
import { LlmConfigSchema } from "@nexqa/shared";
import { generateText, streamText } from "ai";
import { Hono } from "hono";
import { createLlmModel } from "../services/llm.js";
import { createLogger } from "../services/logger.js";
import { storage } from "../services/storage.js";

export const llmRoutes = new Hono()
  .post("/test-connection", async (c) => {
    const log = createLogger("llm", c.req.header("x-trace-id"));
    log.info("测试 LLM 连接");
    const body = await c.req.json<LlmConfig>();
    const parsed = LlmConfigSchema.safeParse(body);
    if (!parsed.success) {
      log.warn("参数不完整", parsed.error.issues);
      return c.json({ ok: false, error: "参数不完整" }, 400);
    }

    log.info("测试配置", {
      provider: parsed.data.provider,
      model: parsed.data.model,
      baseURL: parsed.data.baseURL,
    });
    try {
      const model = createLlmModel(parsed.data);
      const start = Date.now();
      const result = await generateText({
        model,
        prompt: "Hi",
        maxRetries: 1,
      });
      const duration = Date.now() - start;
      log.info(
        `连接成功, 耗时 ${duration}ms, 响应: ${result.text.slice(0, 50)}`,
      );
      return c.json({
        ok: true,
        duration,
        model: parsed.data.model,
        response: result.text.slice(0, 100),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      log.error("连接失败", message);
      return c.json({ ok: false, error: message }, 400);
    }
  })
  .post("/chat", async (c) => {
    const log = createLogger("llm", c.req.header("x-trace-id"));
    log.info("LLM chat 请求");
    const raw = await storage.readRaw("settings.json");
    if (!raw) {
      return c.json(
        { error: "LLM not configured. Please configure in Settings." },
        400,
      );
    }

    const settings = JSON.parse(raw) as Settings;
    if (!settings.llm) {
      return c.json(
        { error: "LLM not configured. Please configure in Settings." },
        400,
      );
    }

    const { messages, system } = await c.req.json<{
      messages: { role: "user" | "assistant"; content: string }[];
      system?: string;
    }>();

    const model = createLlmModel(settings.llm);

    const result = streamText({
      model,
      system,
      messages,
    });

    return result.toDataStreamResponse();
  });
