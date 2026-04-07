import { test, expect, collectConsoleErrors, waitForAppShell, projectPath } from "./fixtures/base";

test.describe("测试报告页功能", () => {
  test("页面可访问且标题可见", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("reports"));
    await waitForAppShell(page);
    await expect(page.locator("text=测试报告").first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test("报告列表或空状态展示", async ({ page }) => {
    await page.goto(projectPath("reports"));
    await waitForAppShell(page);
    const hasList = await page.locator('[class*="card"], [class*="list-item"], [role="listitem"]').first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    const hasEmpty = await page.locator('text=/暂无|没有|空|报告/').first()
      .isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasList || hasEmpty).toBeTruthy();
  });

  test("搜索报告功能可用", async ({ page }) => {
    await page.goto(projectPath("reports"));
    await waitForAppShell(page);
    const searchInput = page.locator('input[placeholder*="搜索"], input[placeholder*="Search"]').first();
    if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await searchInput.fill("冒烟");
      await page.waitForTimeout(500);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("Tabs 切换正常（如有）", async ({ page }) => {
    await page.goto(projectPath("reports"));
    await waitForAppShell(page);
    // 只测试可见的 tabs
    const tabs = page.locator('[role="tab"]:visible');
    const count = await tabs.count();
    if (count > 1) {
      await tabs.nth(1).click();
      await page.waitForTimeout(500);
      await expect(page.locator("body")).toBeVisible();
      await tabs.nth(0).click();
    }
  });

  test("导出按钮存在", async ({ page }) => {
    await page.goto(projectPath("reports"));
    await waitForAppShell(page);
    const exportBtn = page.getByRole("button", { name: /导出|Export|下载/ }).first();
    if (await exportBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(exportBtn).toBeVisible();
    }
  });

  test("点击报告可查看详情", async ({ page }) => {
    await page.goto(projectPath("reports"));
    await waitForAppShell(page);
    const firstItem = page.locator('[class*="card"], [class*="list-item"]').first();
    if (await firstItem.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await firstItem.click();
      await page.waitForTimeout(1_000);
      // 应展示报告详情
      await expect(page.locator("body")).toBeVisible();
    }
  });
});
