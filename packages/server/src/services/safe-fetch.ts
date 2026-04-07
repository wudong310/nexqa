/**
 * safeFetch — 统一 HTTP 客户端封装
 *
 * 解决 Node.js 原生 fetch 在重定向场景下的参数丢失问题：
 * 1. 链式重定向：支持多次跟随（最多 maxRedirects 次）
 * 2. 参数保留：重定向时合并原始 query params
 * 3. 相对路径：用 URL 构造函数解析相对路径 location
 * 4. HTTPS 强制：可配置自动升级 http→https
 * 5. Method/Body 保留：307/308 保留原始 method 和 body，301/302 按规范降级为 GET
 */

import { createLogger } from "./logger.js";

const log = createLogger("safe-fetch");

export interface SafeFetchOptions extends Omit<RequestInit, "redirect"> {
  /** 最大重定向次数，默认 10 */
  maxRedirects?: number;
  /** 是否强制将 http:// 升级为 https://，默认 false */
  forceHttps?: boolean;
  /** 请求超时（ms），默认 30000。会覆盖外部传入的 signal */
  timeout?: number;
}

/**
 * 安全的 fetch 封装，统一处理重定向、参数保留、HTTPS 升级。
 *
 * 所有出站 HTTP 请求都应使用此函数，禁止直接调用原生 fetch()。
 */
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const {
    maxRedirects = 10,
    forceHttps = false,
    timeout = 30000,
    ...fetchInit
  } = options;

  // HTTPS 强制升级
  let currentUrl = forceHttps ? url.replace(/^http:\/\//i, "https://") : url;

  // 强制 manual redirect，由我们自行处理
  let currentInit: RequestInit = {
    ...fetchInit,
    redirect: "manual",
    signal: AbortSignal.timeout(timeout),
  };

  // 保存原始 method 和 body，用于 307/308 保留
  const originalMethod = (fetchInit.method || "GET").toUpperCase();
  const originalBody = fetchInit.body;

  let redirectCount = 0;

  while (true) {
    // biome-ignore lint/style/noRestrictedGlobals: safeFetch 是对原生 fetch 的封装，此处允许直接调用
    const res = await fetch(currentUrl, currentInit);

    // 非重定向状态码，直接返回
    if (![301, 302, 303, 307, 308].includes(res.status)) {
      return res;
    }

    // 超过最大重定向次数
    redirectCount++;
    if (redirectCount > maxRedirects) {
      log.warn(`超过最大重定向次数 (${maxRedirects})，返回最后一个响应`);
      return res;
    }

    const location = res.headers.get("location");
    if (!location) {
      // 没有 location header，无法重定向
      return res;
    }

    // 解析 location（支持相对路径）
    const redirectUrl = new URL(location, currentUrl);

    // 合并原始 query params：如果重定向 URL 没有自己的 query 参数，
    // 则保留原始请求的 query 参数
    const originalUrl = new URL(currentUrl);
    if (!redirectUrl.search && originalUrl.search) {
      redirectUrl.search = originalUrl.search;
    }

    log.info(
      `跟随重定向 [${redirectCount}/${maxRedirects}]: ${res.status} ${currentUrl} -> ${redirectUrl.href}`,
    );

    // 根据状态码决定是否保留 method/body
    // 301/302/303: 按 HTTP 规范降级为 GET，丢弃 body
    // 307/308: 保留原始 method 和 body
    if ([301, 302, 303].includes(res.status)) {
      if (originalMethod !== "GET" && originalMethod !== "HEAD") {
        log.info(`${res.status} 重定向: ${originalMethod} -> GET（规范行为）`);
      }
      currentInit = {
        ...currentInit,
        method: "GET",
        body: undefined,
      };
    } else {
      // 307/308: 保留原始 method 和 body
      currentInit = {
        ...currentInit,
        method: originalMethod,
        body: originalBody,
      };
    }

    currentUrl = redirectUrl.href;
  }
}
