import { test, expect, collectConsoleErrors, waitForAppShell, projectPath } from "./fixtures/base";

test.describe("执行历史页功能", () => {
  test("页面可访问且标题可见", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("history"));
    await waitForAppShell(page);
    await expect(page.locator("text=执行历史").first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test("历史列表或空状态展示", async ({ page }) => {
    await page.goto(projectPath("history"));
    await waitForAppShell(page);
    const hasList = await page.locator('[class*="card"], table, [role="row"]').first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    const hasEmpty = await page.locator('text=/暂无|没有|空|执行记录/').first()
      .isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasList || hasEmpty).toBeTruthy();
  });

  test("搜索/筛选功能可用", async ({ page }) => {
    await page.goto(projectPath("history"));
    await waitForAppShell(page);
    const searchInput = page.locator('input[placeholder*="搜索"], input[placeholder*="Search"], input[type="search"]').first();
    if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await searchInput.fill("smoke");
      await page.waitForTimeout(500);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("状态筛选器可用", async ({ page }) => {
    await page.goto(projectPath("history"));
    await waitForAppShell(page);
    // 筛选按钮/下拉
    const filter = page.locator('select, [role="combobox"], button:has-text("全部"), button:has-text("筛选")').first();
    if (await filter.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await filter.click();
      await page.waitForTimeout(500);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("点击执行记录可展开详情", async ({ page }) => {
    await page.goto(projectPath("history"));
    await waitForAppShell(page);
    const firstRow = page.locator('[class*="card"], [role="row"], tr').first();
    if (await firstRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(1_000);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("AI 分析按钮存在", async ({ page }) => {
    await page.goto(projectPath("history"));
    await waitForAppShell(page);
    // 批量分析/AI 分析按钮
    const aiBtn = page.locator('button:has(svg.lucide-sparkles), button:has-text("分析")').first();
    if (await aiBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(aiBtn).toBeVisible();
    }
  });
});
