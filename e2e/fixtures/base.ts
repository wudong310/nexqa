import { test as base, expect, type Page } from "@playwright/test";

/** 已知项目 ID（seed 数据中的 NexQA 项目） */
export const TEST_PROJECT_ID = "9b523dad-4c74-464b-9106-ee6acae00c60";

/** NexQA 的 basepath，所有前端路由都在这个前缀下 */
export const BASE = "/nexqa";

/** 收集 console errors（过滤掉无关噪音） */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // 过滤掉已知的无害错误（比如 favicon 404、HMR websocket 等）
      if (text.includes("favicon") || text.includes("[HMR]") || text.includes("WebSocket")) return;
      errors.push(text);
    }
  });
  return errors;
}

/** 等待 SPA 加载完成 */
export async function waitForAppShell(page: Page) {
  await page.waitForLoadState("networkidle");
}

/** 生成带 basepath 的项目页面路径 */
export function projectPath(subPath: string) {
  return `${BASE}/p/${TEST_PROJECT_ID}/${subPath}`;
}

export { base as test, expect };
