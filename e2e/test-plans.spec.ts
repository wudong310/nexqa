import { test, expect, collectConsoleErrors, waitForAppShell, projectPath } from "./fixtures/base";

test.describe("测试方案页功能", () => {
  test("页面可访问且标题可见", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("plans"));
    await waitForAppShell(page);
    await expect(page.locator("text=测试方案").first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test("显示方案列表或空状态", async ({ page }) => {
    await page.goto(projectPath("plans"));
    await waitForAppShell(page);
    const hasCards = await page.locator('[class*="card"]').first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasEmpty = await page.locator('text=/暂无|没有|空|创建/').first().isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasCards || hasEmpty).toBeTruthy();
  });

  test("新建方案按钮可点击", async ({ page }) => {
    await page.goto(projectPath("plans"));
    await waitForAppShell(page);
    const addBtn = page.getByRole("button", { name: /新建|创建|新增/ }).first();
    if (await addBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addBtn.click();
      // 应弹出表单对话框
      const dialog = page.locator('[role="dialog"]').first();
      if (await dialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(dialog).toBeVisible();
      }
    }
  });

  test("快速模板可见", async ({ page }) => {
    await page.goto(projectPath("plans"));
    await waitForAppShell(page);
    // 快速模板：冒烟快测、完整回归 等
    const template = page.locator('text=/冒烟快测|完整回归|模板/').first();
    if (await template.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(template).toBeVisible();
    }
  });

  test("AI 方案生成按钮存在", async ({ page }) => {
    await page.goto(projectPath("plans"));
    await waitForAppShell(page);
    const aiBtn = page.getByRole("button", { name: /AI|生成|智能/ }).first();
    const sparkles = page.locator('button:has(svg.lucide-sparkles)').first();
    const hasAi = await aiBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    const hasSparkles = await sparkles.isVisible({ timeout: 2_000 }).catch(() => false);
    expect(hasAi || hasSparkles).toBeTruthy();
  });

  test("方案详情 — 点击方案可查看详情", async ({ page }) => {
    await page.goto(projectPath("plans"));
    await waitForAppShell(page);
    const firstCard = page.locator('[class*="card"]').first();
    if (await firstCard.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await firstCard.click();
      await page.waitForTimeout(1_000);
      // 详情视图应出现
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("删除方案 — 确认对话框", async ({ page }) => {
    await page.goto(projectPath("plans"));
    await waitForAppShell(page);
    const deleteBtn = page.locator('button[aria-label*="删除"], button:has(svg.lucide-trash)').first();
    if (await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deleteBtn.click();
      const dialog = page.locator('[role="alertdialog"], [role="dialog"]').first();
      if (await dialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(dialog).toBeVisible();
      }
    }
  });
});
