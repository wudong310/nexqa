import { test, expect, collectConsoleErrors, TEST_PROJECT_ID, BASE, projectPath } from "./fixtures/base";

test.describe("Dashboard 核心功能", () => {
  test("Dashboard 展示项目摘要信息", async ({ page }) => {
    await page.goto(projectPath("dashboard"));
    await page.waitForLoadState("networkidle");

    // 页面标题可见
    await expect(page).toHaveTitle(/NexQA/);
    // 侧边栏的"概览"应该高亮
    await expect(page.locator("text=概览").first()).toBeVisible();
    // 不白屏 — body 应有内容
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(10);
  });

  test("Dashboard 侧边导航跳转正常", async ({ page }) => {
    await page.goto(projectPath("dashboard"));
    await page.waitForLoadState("networkidle");

    // 点击"API 测试"导航
    await page.locator("nav a", { hasText: "API 测试" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/api$/);
  });

  test("Dashboard 统计卡片可见", async ({ page }) => {
    await page.goto(projectPath("dashboard"));
    await page.waitForLoadState("networkidle");
    // 应有统计卡片（用例数、通过率等）
    const hasCards = await page.locator('[class*="card"]').first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasCards).toBeTruthy();
  });

  test("Dashboard 刷新不 crash", async ({ page }) => {
    await page.goto(projectPath("dashboard"));
    await page.waitForLoadState("networkidle");
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=概览").first()).toBeVisible({ timeout: 10_000 });
  });
});
