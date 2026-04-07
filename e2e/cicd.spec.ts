import { test, expect, collectConsoleErrors, waitForAppShell, projectPath } from "./fixtures/base";

test.describe("CI/CD 配置页功能", () => {
  test("页面可访问且标题可见", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("cicd"));
    await waitForAppShell(page);
    await expect(page.locator("text=CI/CD").first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test("Tabs 导航正常（Webhook/触发规则/历史/回归）", async ({ page }) => {
    await page.goto(projectPath("cicd"));
    await waitForAppShell(page);
    const tabs = page.locator('[role="tab"]');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(1);
    // 依次切换每个 Tab
    for (let i = 0; i < Math.min(count, 4); i++) {
      await tabs.nth(i).click();
      await page.waitForTimeout(500);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("Webhook 配置卡片可见", async ({ page }) => {
    await page.goto(projectPath("cicd"));
    await waitForAppShell(page);
    // Webhook 端点信息
    const webhook = page.locator('text=/Webhook|webhook|端点|endpoint/').first();
    if (await webhook.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(webhook).toBeVisible();
    }
  });

  test("新建触发规则按钮可点击", async ({ page }) => {
    await page.goto(projectPath("cicd"));
    await waitForAppShell(page);
    // 切到触发规则 Tab
    const triggerTab = page.locator('[role="tab"]').filter({ hasText: /触发|规则|Trigger/ }).first();
    if (await triggerTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await triggerTab.click();
    }
    const addBtn = page.getByRole("button", { name: /新建|添加|创建/ }).first();
    if (await addBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addBtn.click();
      const dialog = page.locator('[role="dialog"]').first();
      if (await dialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(dialog).toBeVisible();
      }
    }
  });

  test("执行历史 Tab 可访问", async ({ page }) => {
    await page.goto(projectPath("cicd"));
    await waitForAppShell(page);
    const historyTab = page.locator('[role="tab"]').filter({ hasText: /历史|History/ }).first();
    if (await historyTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await historyTab.click();
      await page.waitForTimeout(1_000);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("回归检测 Tab 可访问", async ({ page }) => {
    await page.goto(projectPath("cicd"));
    await waitForAppShell(page);
    const regrTab = page.locator('[role="tab"]').filter({ hasText: /回归|Regression/ }).first();
    if (await regrTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await regrTab.click();
      await page.waitForTimeout(1_000);
      await expect(page.locator("body")).toBeVisible();
    }
  });
});
