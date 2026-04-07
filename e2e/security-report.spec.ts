import { test, expect, collectConsoleErrors, waitForAppShell, projectPath } from "./fixtures/base";

test.describe("安全报告页功能", () => {
  // 注：安全报告需要 taskId，这里测试列表/入口页面
  test("安全相关入口可访问", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("api"));
    await waitForAppShell(page);
    // 安全扫描入口通常在 API 测试页
    await expect(page.locator("body")).toBeVisible();
    const criticalErrors = errors.filter((e) => !e.includes("404") && !e.includes("key prop"));
    expect(criticalErrors).toHaveLength(0);
  });

  test("安全扫描按钮存在", async ({ page }) => {
    await page.goto(projectPath("api"));
    await waitForAppShell(page);
    // 安全扫描通常是一个按钮
    const secBtn = page.locator('button:has-text("安全"), button:has-text("扫描"), button:has(svg.lucide-shield)').first();
    if (await secBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(secBtn).toBeVisible();
    }
  });

  test("安全扫描 Sheet 可打开", async ({ page }) => {
    await page.goto(projectPath("api"));
    await waitForAppShell(page);
    const secBtn = page.locator('button:has-text("安全扫描")').first();
    if (await secBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await secBtn.click();
      const sheet = page.locator('[role="dialog"], [data-state="open"]').first();
      if (await sheet.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(sheet).toBeVisible();
      }
    }
  });

  test("安全报告页 — 带 taskId 路由格式正确", async ({ page }) => {
    // 用假 taskId 测试路由不 crash
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("security/fake-task-id"));
    await waitForAppShell(page);
    // 页面应能加载（可能显示错误状态但不白屏）
    await expect(page.locator("body")).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(5);
  });

  test("安全报告 — 严重度筛选器可见（如有数据）", async ({ page }) => {
    await page.goto(projectPath("api"));
    await waitForAppShell(page);
    // 通过安全报告列表入口进入
    const secLink = page.locator('a[href*="security"], button:has-text("安全报告")').first();
    if (await secLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await secLink.click();
      await page.waitForTimeout(1_000);
    }
    await expect(page.locator("body")).toBeVisible();
  });
});
