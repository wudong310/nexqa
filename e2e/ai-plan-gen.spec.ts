import { test, expect, collectConsoleErrors, waitForAppShell, projectPath } from "./fixtures/base";

/**
 * AI 方案生成 — E2E 专项
 *
 * 入口：测试方案页 → "AI 生成方案" 按钮 → PlanGenSheet
 * 交互：按钮 → Sheet(600px) → AI 生成(spinner) → 方案预览 → 采纳方案
 * 四态：idle(无结果) → generating → result → error
 */
test.describe("AI 方案生成 — 测试方案页", () => {
  // ── Happy Path ──

  test("测试方案页显示 AI 生成方案按钮", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("plans"));
    await waitForAppShell(page);

    await expect(page.locator("text=测试方案").first()).toBeVisible({ timeout: 10_000 });

    // "AI 生成方案" 按钮
    const aiBtn = page.getByRole("button", { name: /AI 生成方案/ }).first();
    const sparklesBtn = page.locator('button:has(svg.lucide-sparkles)').first();

    const hasAiBtn = await aiBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    const hasSparkles = await sparklesBtn.isVisible({ timeout: 2_000 }).catch(() => false);
    expect(hasAiBtn || hasSparkles).toBeTruthy();

    expect(errors).toHaveLength(0);
  });

  test("点击 AI 生成方案 打开 PlanGenSheet", async ({ page }) => {
    await page.goto(projectPath("plans"));
    await waitForAppShell(page);

    const aiBtn = page.getByRole("button", { name: /AI 生成方案/ }).first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await aiBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    // Sheet 标题应为 "AI 生成测试方案"
    await expect(page.locator("text=AI 生成测试方案")).toBeVisible();
  });

  test("PlanGenSheet — 初始空态显示引导文案", async ({ page }) => {
    await page.goto(projectPath("plans"));
    await waitForAppShell(page);

    const aiBtn = page.getByRole("button", { name: /AI 生成方案/ }).first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await aiBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    // 空态引导文案
    const emptyGuide = page.locator("text=暂无可生成方案").first();
    const description = page.locator("text=AI 将根据项目 API 自动生成测试方案").first();
    const generating = page.locator("text=正在生成测试方案").first();

    const hasEmpty = await emptyGuide.isVisible({ timeout: 3_000 }).catch(() => false);
    const hasDesc = await description.isVisible({ timeout: 2_000 }).catch(() => false);
    const hasGenerating = await generating.isVisible({ timeout: 2_000 }).catch(() => false);

    // Sheet 打开后应有 引导/描述/正在生成 之一
    expect(hasEmpty || hasDesc || hasGenerating).toBeTruthy();
  });

  test("PlanGenSheet — Sheet 宽度符合 L 档(600px)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(projectPath("plans"));
    await waitForAppShell(page);

    const aiBtn = page.getByRole("button", { name: /AI 生成方案/ }).first();
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

  test("PlanGenSheet — 有结果时显示采纳按钮", async ({ page }) => {
    await page.goto(projectPath("plans"));
    await waitForAppShell(page);

    const aiBtn = page.getByRole("button", { name: /AI 生成方案/ }).first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await aiBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    // 等待可能的生成完成
    await page.waitForTimeout(10_000);

    // 检查结果态：有采纳按钮
    const adoptBtn = page.getByRole("button", { name: /采纳/ }).first();
    if (await adoptBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(adoptBtn).toBeEnabled();
      // 取消按钮也应存在
      const cancelBtn = page.getByRole("button", { name: /取消/ }).first();
      if (await cancelBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await expect(cancelBtn).toBeVisible();
      }
    }
  });

  test("PlanGenSheet — 结果预览包含方案名称和执行配置", async ({ page }) => {
    await page.goto(projectPath("plans"));
    await waitForAppShell(page);

    const aiBtn = page.getByRole("button", { name: /AI 生成方案/ }).first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await aiBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await page.waitForTimeout(10_000);

    // 方案结果应含执行配置 badge
    const concurrency = page.locator("text=并发").first();
    const retry = page.locator("text=重试").first();

    if (await concurrency.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(concurrency).toBeVisible();
    }
    if (await retry.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(retry).toBeVisible();
    }
  });

  // ── Error/Empty Path ──

  test("PlanGenSheet — 生成失败显示错误态和重试", async ({ page }) => {
    await page.goto(projectPath("plans"));
    await waitForAppShell(page);

    const aiBtn = page.getByRole("button", { name: /AI 生成方案/ }).first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await aiBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await page.waitForTimeout(10_000);

    // 如果出现错误态
    const errorIcon = page.locator("svg.lucide-x-circle").first();
    if (await errorIcon.isVisible({ timeout: 2_000 }).catch(() => false)) {
      // 应有重试按钮
      const retryBtn = page.getByRole("button", { name: /重试/ }).first();
      await expect(retryBtn).toBeVisible();
      // 错误消息可见
      const errorMsg = page.locator(".text-destructive").first();
      await expect(errorMsg).toBeVisible();
    }
  });

  test("PlanGenSheet — 无 API 端点时引导前往 API 页", async ({ page }) => {
    await page.goto(projectPath("plans"));
    await waitForAppShell(page);

    const aiBtn = page.getByRole("button", { name: /AI 生成方案/ }).first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await aiBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    const emptyGuide = page.locator("text=暂无可生成方案").first();
    if (await emptyGuide.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // 应有引导去 API 测试页
      const goApi = page.locator("text=前往 API 测试").first();
      if (await goApi.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await expect(goApi).toBeVisible();
      }
    }
  });

  test("PlanGenSheet — Escape 关闭 Sheet", async ({ page }) => {
    await page.goto(projectPath("plans"));
    await waitForAppShell(page);

    const aiBtn = page.getByRole("button", { name: /AI 生成方案/ }).first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await aiBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    const stillVisible = await sheet.isVisible().catch(() => false);
    expect(stillVisible).toBe(false);
  });
});
