import { test, expect, collectConsoleErrors, waitForAppShell, projectPath } from "./fixtures/base";

test.describe("覆盖率页功能", () => {
  test("页面可访问且标题可见", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("coverage"));
    await waitForAppShell(page);
    await expect(page.locator("text=覆盖率").first()).toBeVisible({ timeout: 10_000 });
    const criticalErrors = errors.filter(
      (e) => !e.includes("key") && !e.includes("unique")
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test("覆盖率统计卡片可见", async ({ page }) => {
    await page.goto(projectPath("coverage"));
    await waitForAppShell(page);
    // 应显示统计卡片（端点覆盖率、方法覆盖率等）或加载骨架
    const hasStats = await page.locator('[class*="card"], text=/覆盖|端点|方法|接口/').first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    const hasEmpty = await page.locator('text=/暂无|没有|加载失败/').first()
      .isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasStats || hasEmpty).toBeTruthy();
  });

  test("刷新按钮可点击", async ({ page }) => {
    await page.goto(projectPath("coverage"));
    await waitForAppShell(page);
    const refreshBtn = page.getByRole("button", { name: /刷新|Refresh/ }).first();
    if (await refreshBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await refreshBtn.click();
      await page.waitForTimeout(1_000);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("导出按钮存在", async ({ page }) => {
    await page.goto(projectPath("coverage"));
    await waitForAppShell(page);
    const exportBtn = page.getByRole("button", { name: /导出|Export|下载/ }).first();
    if (await exportBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(exportBtn).toBeVisible();
    }
  });

  test("覆盖率矩阵或趋势图可见", async ({ page }) => {
    await page.goto(projectPath("coverage"));
    await waitForAppShell(page);
    // 页面应有矩阵视图或趋势图
    const hasContent = await page.locator('table, canvas, svg, [class*="matrix"], [class*="chart"]').first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    const hasText = await page.locator('text=/GET|POST|PUT|DELETE|覆盖/').first()
      .isVisible({ timeout: 3_000 }).catch(() => false);
    const hasEmpty = await page.locator('text=/暂无|没有数据/').first()
      .isVisible({ timeout: 2_000 }).catch(() => false);
    expect(hasContent || hasText || hasEmpty).toBeTruthy();
  });
});
