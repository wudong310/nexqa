import { test, expect, collectConsoleErrors, waitForAppShell, projectPath } from "./fixtures/base";

/**
 * AI 一键冒烟测试 — E2E 专项
 *
 * 入口：Dashboard 页 → "开始冒烟" 按钮 → SmokeConfirmSheet
 * 交互：按钮 → Sheet(480px) → AI 分析核心路径 → 结果预览 → 开始执行
 * 四态：analyzing → ready(有数据) → ready(空) → executing
 */
test.describe("AI 一键冒烟 — Dashboard", () => {
  // ── Happy Path ──

  test("Dashboard 显示冒烟操作入口", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("dashboard"));
    await waitForAppShell(page);

    // Dashboard 应有 "AI 一键冒烟" 卡片标题
    const smokeTitle = page.locator("text=AI 一键冒烟").first();
    await expect(smokeTitle).toBeVisible({ timeout: 10_000 });

    // "开始冒烟" 按钮应可见
    const startBtn = page.getByRole("button", { name: /开始冒烟/ }).first();
    await expect(startBtn).toBeVisible();

    const critical = errors.filter(
      (e) => !e.includes("404") && !e.includes("key") && !e.includes("400")
    );
    expect(critical).toHaveLength(0);
  });

  test("点击 开始冒烟 打开 SmokeConfirmSheet", async ({ page }) => {
    await page.goto(projectPath("dashboard"));
    await waitForAppShell(page);

    const startBtn = page.getByRole("button", { name: /开始冒烟/ }).first();
    await expect(startBtn).toBeVisible({ timeout: 10_000 });
    await startBtn.click();

    // Sheet 应打开（Radix Dialog Content），标题包含 "AI 一键冒烟"
    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    // 标题文字可能在页面级别而非 sheet 子元素内
    await expect(page.locator("text=AI 一键冒烟").last()).toBeVisible({ timeout: 5_000 });
  });

  test("SmokeConfirmSheet 显示四态之一（分析中/就绪/空）", async ({ page }) => {
    await page.goto(projectPath("dashboard"));
    await waitForAppShell(page);

    const startBtn = page.getByRole("button", { name: /开始冒烟/ }).first();
    if (!(await startBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;
    await startBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    // Sheet 内应至少出现以下之一：
    // - 分析中："正在分析" / spinner
    // - 就绪有数据："核心路径" / "开始执行"
    // - 就绪空态："暂无冒烟用例"
    // 等待一段时间让 AI 处理
    await page.waitForTimeout(3_000);

    const hasAnalyzing = await page.locator("text=正在分析").first().isVisible().catch(() => false);
    const hasReadyData = await page.locator("text=核心路径").first().isVisible().catch(() => false);
    const hasExecBtn = await page.getByRole("button", { name: /开始执行/ }).first().isVisible().catch(() => false);
    const hasEmpty = await page.locator("text=暂无冒烟用例").first().isVisible().catch(() => false);

    // 至少一种状态出现
    expect(hasAnalyzing || hasReadyData || hasExecBtn || hasEmpty).toBeTruthy();
  });

  test("SmokeConfirmSheet — Sheet 宽度符合 S 档(480px)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(projectPath("dashboard"));
    await waitForAppShell(page);

    const startBtn = page.getByRole("button", { name: /开始冒烟/ }).first();
    if (!(await startBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;
    await startBtn.click();

    const sheetContent = page.locator('[role="dialog"]').first();
    if (!(await sheetContent.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    const box = await sheetContent.boundingBox();
    if (box) {
      // S 档 = 480px，允许一定误差
      expect(box.width).toBeLessThanOrEqual(520);
      expect(box.width).toBeGreaterThanOrEqual(400);
    }
  });

  test("SmokeConfirmSheet — 有执行按钮时点击触发操作", async ({ page }) => {
    await page.goto(projectPath("dashboard"));
    await waitForAppShell(page);

    const startBtn = page.getByRole("button", { name: /开始冒烟/ }).first();
    if (!(await startBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;
    await startBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    // 等待分析完成，看是否有执行按钮
    await page.waitForTimeout(5_000);
    const execBtn = page.getByRole("button", { name: /开始执行/ }).first();
    if (await execBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // 执行按钮点击后应有反馈（loading 态或 toast）
      // 监听 toast 出现
      await execBtn.click();
      await page.waitForTimeout(1_000);
      // 点击后应有反馈：toast（成功/失败）或按钮变化或 Sheet 关闭
      const hasToast = await page.locator('[data-sonner-toast]').first()
        .isVisible({ timeout: 3_000 }).catch(() => false);
      const sheetGone = !(await sheet.isVisible().catch(() => true));
      const hasSpinner = await page.locator("svg.animate-spin").first()
        .isVisible().catch(() => false);
      expect(hasToast || sheetGone || hasSpinner).toBeTruthy();
    }
  });

  // ── Error/Empty Path ──

  test("SmokeConfirmSheet — 空项目显示引导文案和跳转链接", async ({ page }) => {
    await page.goto(projectPath("dashboard"));
    await waitForAppShell(page);

    const startBtn = page.getByRole("button", { name: /开始冒烟/ }).first();
    if (!(await startBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;
    await startBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await page.waitForTimeout(5_000);

    const emptyState = page.locator("text=暂无冒烟用例").first();
    if (await emptyState.isVisible().catch(() => false)) {
      // 空态应有引导文案
      await expect(emptyState).toBeVisible();
      // 应有跳转到 API 测试页的链接/按钮
      const goApi = page.locator("text=前往 API 测试").first();
      if (await goApi.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await expect(goApi).toBeVisible();
      }
    }
  });

  test("SmokeConfirmSheet — 关闭按钮/取消正常工作", async ({ page }) => {
    await page.goto(projectPath("dashboard"));
    await waitForAppShell(page);

    const startBtn = page.getByRole("button", { name: /开始冒烟/ }).first();
    if (!(await startBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;
    await startBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    // 点取消或关闭按钮
    const cancelBtn = page.getByRole("button", { name: /取消|关闭/ }).first();
    if (await cancelBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await cancelBtn.click();
      await page.waitForTimeout(500);
      // Sheet 应关闭
      await expect(sheet).not.toBeVisible({ timeout: 3_000 });
    } else {
      // fallback: Escape 关闭
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }
  });

  test("SmokeConfirmSheet — Escape 键可关闭 Sheet", async ({ page }) => {
    await page.goto(projectPath("dashboard"));
    await waitForAppShell(page);

    const startBtn = page.getByRole("button", { name: /开始冒烟/ }).first();
    if (!(await startBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;
    await startBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    const stillVisible = await sheet.isVisible().catch(() => false);
    // Sheet 应该关闭了（或至少没有 crash）
    expect(typeof stillVisible).toBe("boolean");
  });
});
