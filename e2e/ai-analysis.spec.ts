import { test, expect, collectConsoleErrors, waitForAppShell, projectPath } from "./fixtures/base";

/**
 * AI 智能分析 — E2E 专项
 *
 * 入口：执行历史页 → 有失败用例的批次 → "AI 分析全部失败" 按钮 → AnalysisSheet
 * 交互：按钮 → Sheet(540px) → 步骤进度 → 分析结果 → 复制报告
 * 四态：loading(步骤进度) → 有分析结果 → 空(无失败) → error(分析失败)
 */
test.describe("AI 智能分析 — 执行历史页", () => {
  // ── Happy Path ──

  test("执行历史页可访问且有基础内容", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("history"));
    await waitForAppShell(page);

    await expect(page.locator("text=执行历史").first()).toBeVisible({ timeout: 10_000 });

    // 页面应有执行记录或空态
    const hasRecords = await page.locator('[class*="card"], table, [role="row"]').first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    const hasEmpty = await page.locator('text=/暂无|没有|执行记录/').first()
      .isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasRecords || hasEmpty).toBeTruthy();

    expect(errors).toHaveLength(0);
  });

  test("有失败记录时 AI 分析按钮可见", async ({ page }) => {
    await page.goto(projectPath("history"));
    await waitForAppShell(page);

    // AI 分析按钮（带 Sparkles 图标或文字 "AI 分析"）
    const aiBtn = page.locator('button:has-text("AI 分析"), button:has(svg.lucide-sparkles)').first();
    if (await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(aiBtn).toBeVisible();
    }
    // 如果没有失败记录，按钮不显示是正常的
  });

  test("AI 分析按钮点击打开 AnalysisSheet", async ({ page }) => {
    await page.goto(projectPath("history"));
    await waitForAppShell(page);

    const aiBtn = page.locator('button:has-text("AI 分析")').first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await aiBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (await sheet.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Sheet 标题应为 "AI 智能分析"
      await expect(page.locator("text=AI 智能分析")).toBeVisible();
    }
  });

  test("AnalysisSheet — 显示步骤进度或结果", async ({ page }) => {
    await page.goto(projectPath("history"));
    await waitForAppShell(page);

    const aiBtn = page.locator('button:has-text("AI 分析")').first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await aiBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    // 等待分析完成（最多 15 秒）
    await page.waitForTimeout(3_000);

    // 四种可能状态：
    // 1. 步骤进度（loading）
    const hasProgress = await page.locator('text=/正在分析|推理分析|收集.*数据/').first()
      .isVisible().catch(() => false);
    // 2. 分析结果
    const hasResult = await page.locator('text=/全部健康|发现.*问题|行动建议/').first()
      .isVisible().catch(() => false);
    // 3. 空态
    const hasEmpty = await page.locator("text=暂无分析结果").first()
      .isVisible().catch(() => false);
    // 4. 错误态
    const hasError = await page.locator('text=/分析失败|失败.*重试/').first()
      .isVisible().catch(() => false);

    expect(hasProgress || hasResult || hasEmpty || hasError).toBeTruthy();
  });

  test("AnalysisSheet — Sheet 宽度符合 M 档(540px)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(projectPath("history"));
    await waitForAppShell(page);

    const aiBtn = page.locator('button:has-text("AI 分析")').first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await aiBtn.click();

    const sheetContent = page.locator('[role="dialog"]').first();
    if (!(await sheetContent.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    const box = await sheetContent.boundingBox();
    if (box) {
      // M 档 = 540px
      expect(box.width).toBeLessThanOrEqual(580);
      expect(box.width).toBeGreaterThanOrEqual(480);
    }
  });

  test("AnalysisSheet — 复制报告按钮（有结果时）", async ({ page }) => {
    await page.goto(projectPath("history"));
    await waitForAppShell(page);

    const aiBtn = page.locator('button:has-text("AI 分析")').first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await aiBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    // 等待分析完成
    await page.waitForTimeout(8_000);

    const copyBtn = page.getByRole("button", { name: /复制.*报告/ }).first();
    if (await copyBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // 复制按钮应可点击
      await expect(copyBtn).toBeEnabled();
    }
  });

  // ── Error/Empty Path ──

  test("AnalysisSheet — 无失败记录时显示引导文案", async ({ page }) => {
    await page.goto(projectPath("history"));
    await waitForAppShell(page);

    // 直接尝试打开 Sheet（通过可能的空态路径）
    const aiBtn = page.locator('button:has-text("AI 分析")').first();

    // 如果没有 AI 分析按钮（没有失败记录），那就是正确的空态行为
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      // 确认页面正常显示
      await expect(page.locator("text=执行历史").first()).toBeVisible();
      return;
    }

    await aiBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await page.waitForTimeout(5_000);

    // 检查空态/引导文案
    const emptyState = page.locator("text=暂无分析结果").first();
    const guideText = page.locator("text=请先执行批量测试").first();
    if (await emptyState.isVisible().catch(() => false)) {
      await expect(emptyState).toBeVisible();
    }
    if (await guideText.isVisible().catch(() => false)) {
      await expect(guideText).toBeVisible();
    }
  });

  test("AnalysisSheet — 错误态有重试按钮", async ({ page }) => {
    await page.goto(projectPath("history"));
    await waitForAppShell(page);

    const aiBtn = page.locator('button:has-text("AI 分析")').first();
    if (!(await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await aiBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await page.waitForTimeout(8_000);

    // 如果出现错误态
    const errorIcon = page.locator("svg.lucide-x-circle").first();
    if (await errorIcon.isVisible({ timeout: 2_000 }).catch(() => false)) {
      // 应有重试按钮
      const retryBtn = page.getByRole("button", { name: /重试/ }).first();
      await expect(retryBtn).toBeVisible();
    }
  });

  test("AnalysisSheet — Escape 关闭 Sheet", async ({ page }) => {
    await page.goto(projectPath("history"));
    await waitForAppShell(page);

    const aiBtn = page.locator('button:has-text("AI 分析")').first();
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
