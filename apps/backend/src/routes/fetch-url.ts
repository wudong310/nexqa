import * as cheerio from "cheerio";
import { Hono } from "hono";
import { createLogger } from "../services/logger.js";
import { safeFetch } from "../services/safe-fetch.js";

export const fetchUrlRoutes = new Hono().post("/", async (c) => {
  const log = createLogger("fetch-url", c.req.header("x-trace-id"));
  const { url } = await c.req.json<{ url: string }>();
  log.info(`抓取 URL: ${url}`);

  try {
    const res = await safeFetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NexQA/1.0)",
        Accept: "text/html,application/xhtml+xml,text/plain,text/markdown",
      },
      timeout: 15000,
    });

    if (!res.ok) {
      log.error(`抓取失败: ${res.status} ${res.statusText}`);
      return c.json(
        { error: `Failed to fetch URL: ${res.status} ${res.statusText}` },
        400,
      );
    }

    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();

    if (
      contentType.includes("text/plain") ||
      contentType.includes("text/markdown")
    ) {
      return c.json({ content: text });
    }

    const $ = cheerio.load(text);
    $("script, style, nav, footer, header, aside").remove();

    const mainContent =
      $("main").text() ||
      $("article").text() ||
      $(".content").text() ||
      $("body").text();

    const cleaned = mainContent.replace(/\s+/g, " ").trim();

    if (cleaned.length < 50) {
      log.warn("提取内容过少", cleaned.length);
      return c.json(
        {
          error:
            "Could not extract meaningful content from this URL. Please copy and paste the content manually.",
        },
        400,
      );
    }

    log.info(`抓取成功, 内容长度: ${cleaned.length}`);
    return c.json({ content: cleaned });
  } catch (err) {
    log.error("抓取异常", err instanceof Error ? err.message : err);
    return c.json(
      {
        error: `Failed to fetch URL. Please copy and paste the content manually. (${err instanceof Error ? err.message : "Unknown error"})`,
      },
      400,
    );
  }
});
