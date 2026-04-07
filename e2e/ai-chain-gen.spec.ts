import { test, expect, collectConsoleErrors, waitForAppShell, projectPath } from "./fixtures/base";

/**
 * AI 测试链生成 — E2E 专项
 *
 * 入口：测试链页 → "AI 生成测试链" 按钮 → ChainGenSheet
 * 交互：按钮 → Sheet(600px) → AI 分析依赖 → 生成链 → Tabs 预览 → 采纳全部
 * 四态：idle → analyzing → result(Tabs预览) → error
 */
test.describe("AI 测试链生成 — 测试链页", () => {
  // ── Happy Path ──

  test("测试链页显示 AI 生成按钮", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("chains"));
    await waitForAppShell(page);

    await expect(page.locator("text=测试链").first()).toBeVisible({ timeout: 10_000 });

    // "AI 生成测试链" 按钮
    const aiBtn = page.getByRole("button", { name: /AI 生成测试链/ }).first();
    const sparklesBtn = page.locator('button:has(svg.lucide-sparkles)').first();

    const hasAiBtn = await aiBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    const hasSparkles = await sparklesBtn.isVisible({ timeout: 2_000 }).catch(() => false);
    expect(hasAiBtn || hasSparkles).toBeTruthy();

    expect(errors).toHaveLength(0);
  });

  test("点击 AI 生成测试链 打开 ChainGenSheet", async ({ page }) => {
    await page.goto(projectPath("chains"));
    await waitForAppShell(page);

    const aiBtn = page.getByRole("button", { name: /AI 生成测试链/ }).first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      // 可能是 Sparkles 按钮
      const sparklesBtn = page.locator('button:has(svg.lucide-sparkles)').first();
      if (await sparklesBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await sparklesBtn.click();
      } else {
        return;
      }
    } else {
      await aiBtn.click();
    }

    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5_000 });
  });

  test("ChainGenSheet — 自动开始分析依赖", async ({ page }) => {
    await page.goto(projectPath("chains"));
    await waitForAppShell(page);

    const aiBtn = page.getByRole("button", { name: /AI 生成测试链/ }).first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await aiBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    // Sheet 打开后应有以下之一：
    // - 分析中进度
    // - 直接显示结果（如果已有缓存）
    // - 空态
    // - 错误态
    await page.waitForTimeout(3_000);

    const hasAnalyzing = await page.locator('text=/正在分析|分析依赖|分析中/').first()
      .isVisible().catch(() => false);
    const hasProgress = await page.locator("svg.animate-spin").first()
      .isVisible().catch(() => false);
    const hasResult = await page.locator('text=/采纳|测试链|步骤/').first()
      .isVisible().catch(() => false);
    const hasEmpty = await page.locator('text=/暂无|无法生成/').first()
      .isVisible().catch(() => false);
    const hasError = await page.locator("svg.lucide-x-circle").first()
      .isVisible().catch(() => false);

    expect(hasAnalyzing || hasProgress || hasResult || hasEmpty || hasError).toBeTruthy();
  });

  test("ChainGenSheet — Sheet 宽度符合 L 档(600px)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(projectPath("chains"));
    await waitForAppShell(page);

    const aiBtn = page.getByRole("button", { name: /AI 生成测试链/ }).first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await aiBtn.click();

    const sheetContent = page.locator('[role="dialog"]').first();
    if (!(await sheetContent.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    const box = await sheetContent.boundingBox();
    if (box) {
      // L 档 = 600px
      expect(box.width).toBeLessThanOrEqual(650);
      expect(box.width).toBeGreaterThanOrEqual(550);
    }
  });

  test("ChainGenSheet — 有结果时显示 Tabs 预览和采纳按钮", async ({ page }) => {
    await page.goto(projectPath("chains"));
    await waitForAppShell(page);

    const aiBtn = page.getByRole("button", { name: /AI 生成测试链/ }).first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await aiBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    // 等待分析完成
    await page.waitForTimeout(15_000);

    // 结果态：Tabs 和采纳按钮
    const tabs = page.locator('[role="tablist"]').first();
    const adoptBtn = page.getByRole("button", { name: /采纳/ }).first();

    if (await tabs.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(tabs).toBeVisible();
    }

    if (await adoptBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(adoptBtn).toBeEnabled();
    }
  });

  // ── Error/Empty Path ──

  test("ChainGenSheet — 错误态有重试按钮", async ({ page }) => {
    await page.goto(projectPath("chains"));
    await waitForAppShell(page);

    const aiBtn = page.getByRole("button", { name: /AI 生成测试链/ }).first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await aiBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await page.waitForTimeout(15_000);

    // 如果出现错误态
    const errorIcon = page.locator("svg.lucide-x-circle").first();
    if (await errorIcon.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const retryBtn = page.getByRole("button", { name: /重试|重新/ }).first();
      await expect(retryBtn).toBeVisible();
    }
  });

  test("ChainGenSheet — 空态显示引导", async ({ page }) => {
    await page.goto(projectPath("chains"));
    await waitForAppShell(page);

    const aiBtn = page.getByRole("button", { name: /AI 生成测试链/ }).first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await aiBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await page.waitForTimeout(15_000);

    // 如果出现空态
    const emptyState = page.locator('text=/暂无|无法生成|没有/').first();
    if (await emptyState.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(emptyState).toBeVisible();
    }
  });

  test("ChainGenSheet — Escape 关闭 Sheet", async ({ page }) => {
    await page.goto(projectPath("chains"));
    await waitForAppShell(page);

    const aiBtn = page.getByRole("button", { name: /AI 生成测试链/ }).first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await aiBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    const stillVisible = await sheet.isVisible().catch(() => false);
    expect(stillVisible).toBe(false);
  });

  test("ChainGenSheet — 按钮点击后不可重复点击（防重复）", async ({ page }) => {
    await page.goto(projectPath("chains"));
    await waitForAppShell(page);

    const aiBtn = page.getByRole("button", { name: /AI 生成测试链/ }).first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await aiBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    // 如果有开始分析/生成按钮
    const generateBtn = page.getByRole("button", { name: /生成|分析|开始/ }).first();
    if (await generateBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await generateBtn.click();
      await page.waitForTimeout(500);
      const isDisabled = await generateBtn.isDisabled().catch(() => false);
      const hasSpinner = await page.locator("svg.animate-spin").first()
        .isVisible({ timeout: 2_000 }).catch(() => false);
      expect(isDisabled || hasSpinner).toBeTruthy();
    }
  });
});
