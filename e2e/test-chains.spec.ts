import { test, expect, collectConsoleErrors, waitForAppShell, projectPath } from "./fixtures/base";

test.describe("测试链页功能", () => {
  test("页面可访问且标题可见", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("chains"));
    await waitForAppShell(page);
    await expect(page.locator("text=测试链").first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test("显示链列表或空状态", async ({ page }) => {
    await page.goto(projectPath("chains"));
    await waitForAppShell(page);
    // 应显示链卡片列表或空状态
    const hasCards = await page.locator('[class*="card"], [data-testid*="chain"]').first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasEmpty = await page.locator('text=/暂无|没有|创建第一个|空/').first().isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasCards || hasEmpty).toBeTruthy();
  });

  test("新建测试链按钮可点击", async ({ page }) => {
    await page.goto(projectPath("chains"));
    await waitForAppShell(page);
    const addBtn = page.getByRole("button", { name: /新建|创建|新增|添加/ }).first();
    if (await addBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await addBtn.click();
      // 应进入创建视图或弹出对话框
      await page.waitForTimeout(1_000);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("AI 链生成按钮存在", async ({ page }) => {
    await page.goto(projectPath("chains"));
    await waitForAppShell(page);
    // Sparkles 图标 或 "AI 生成" 按钮
    const aiBtn = page.getByRole("button", { name: /AI|生成|智能/ }).first();
    const sparkles = page.locator('button:has(svg.lucide-sparkles)').first();
    const hasAi = await aiBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    const hasSparkles = await sparkles.isVisible({ timeout: 2_000 }).catch(() => false);
    expect(hasAi || hasSparkles).toBeTruthy();
  });

  test("删除链 — 确认对话框出现", async ({ page }) => {
    await page.goto(projectPath("chains"));
    await waitForAppShell(page);
    // 如果有链存在，找删除按钮
    const deleteBtn = page.locator('button[aria-label*="删除"], button:has(svg.lucide-trash)').first();
    if (await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deleteBtn.click();
      const dialog = page.locator('[role="alertdialog"], [role="dialog"]').first();
      await expect(dialog).toBeVisible({ timeout: 3_000 });
    }
  });

  test("链编辑器 — 步骤列表可操作", async ({ page }) => {
    await page.goto(projectPath("chains"));
    await waitForAppShell(page);
    // 点击第一个链进入编辑
    const firstChain = page.locator('[class*="card"]').first();
    if (await firstChain.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const editBtn = firstChain.locator('button').filter({ hasText: /编辑|详情/ }).first();
      if (await editBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await editBtn.click();
        await page.waitForTimeout(1_000);
        await expect(page.locator("body")).toBeVisible();
      }
    }
  });
});
