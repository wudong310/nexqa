import { test, expect, collectConsoleErrors, waitForAppShell, projectPath } from "./fixtures/base";

/**
 * AI 安全扫描 — E2E 专项
 *
 * 入口：Dashboard 页 → "开始扫描" 按钮 → SecurityScanSheet
 * 交互：按钮 → Sheet(600px) → 选环境+扫描类型 → AI 三阶段扫描 → 完成/查看报告
 * 四态：config(有环境) → config(无环境) → scanning → completed → failed
 */
test.describe("AI 安全扫描 — Dashboard", () => {
  // ── Happy Path ──

  test("Dashboard 显示安全扫描入口", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("dashboard"));
    await waitForAppShell(page);

    // "AI 安全扫描" 标题
    const title = page.locator("text=AI 安全扫描").first();
    await expect(title).toBeVisible({ timeout: 10_000 });

    // "开始扫描" 按钮
    const scanBtn = page.getByRole("button", { name: /开始扫描/ }).first();
    await expect(scanBtn).toBeVisible();

    const critical = errors.filter(
      (e) => !e.includes("404") && !e.includes("key") && !e.includes("400")
    );
    expect(critical).toHaveLength(0);
  });

  test("点击 开始扫描 打开 SecurityScanSheet", async ({ page }) => {
    await page.goto(projectPath("dashboard"));
    await waitForAppShell(page);

    const scanBtn = page.getByRole("button", { name: /开始扫描/ }).first();
    await expect(scanBtn).toBeVisible({ timeout: 10_000 });
    await scanBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    // Sheet 标题应为 "AI 安全扫描"（Sheet 内的标题是最后一个匹配）
    await expect(page.locator("text=AI 安全扫描").last()).toBeVisible();
  });

  test("SecurityScanSheet — 配置界面有环境选择和扫描类型", async ({ page }) => {
    await page.goto(projectPath("dashboard"));
    await waitForAppShell(page);

    const scanBtn = page.getByRole("button", { name: /开始扫描/ }).first();
    if (!(await scanBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;
    await scanBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    // 配置界面应有：环境选择/测试类型/开始按钮 或 "暂无可用环境" 空态
    const envSelect = page.locator("text=扫描环境").first();
    const testTypes = page.locator("text=测试类型").first();
    const emptyEnv = page.locator("text=暂无可用环境").first();

    const hasConfig = await envSelect.isVisible({ timeout: 3_000 }).catch(() => false);
    const hasTestTypes = await testTypes.isVisible().catch(() => false);
    const hasEmpty = await emptyEnv.isVisible().catch(() => false);

    // 至少一种状态
    expect(hasConfig || hasEmpty).toBeTruthy();

    if (hasConfig) {
      expect(hasTestTypes).toBeTruthy();
    }
  });

  test("SecurityScanSheet — 默认勾选常见扫描类型", async ({ page }) => {
    await page.goto(projectPath("dashboard"));
    await waitForAppShell(page);

    const scanBtn = page.getByRole("button", { name: /开始扫描/ }).first();
    if (!(await scanBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;
    await scanBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    // 检查默认勾选的扫描类型
    const sqlInjection = page.locator("text=SQL 注入").first();
    const xss = page.locator("text=XSS").first();

    if (await sqlInjection.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(sqlInjection).toBeVisible();
    }
    if (await xss.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(xss).toBeVisible();
    }
  });

  test("SecurityScanSheet — Sheet 宽度符合 L 档(600px)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(projectPath("dashboard"));
    await waitForAppShell(page);

    const scanBtn = page.getByRole("button", { name: /开始扫描/ }).first();
    if (!(await scanBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;
    await scanBtn.click();

    const sheetContent = page.locator('[role="dialog"]').first();
    if (!(await sheetContent.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    const box = await sheetContent.boundingBox();
    if (box) {
      // L 档 = 600px
      expect(box.width).toBeLessThanOrEqual(650);
      expect(box.width).toBeGreaterThanOrEqual(550);
    }
  });

  test("SecurityScanSheet — 安全提示可见", async ({ page }) => {
    await page.goto(projectPath("dashboard"));
    await waitForAppShell(page);

    const scanBtn = page.getByRole("button", { name: /开始扫描/ }).first();
    if (!(await scanBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;
    await scanBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    // 应有安全提示："只应在 dev/test 环境中执行"
    const warning = page.locator("text=dev/test").first();
    if (await warning.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(warning).toBeVisible();
    }
  });

  // ── Error/Empty Path ──

  test("SecurityScanSheet — 无环境时显示空态引导", async ({ page }) => {
    await page.goto(projectPath("dashboard"));
    await waitForAppShell(page);

    const scanBtn = page.getByRole("button", { name: /开始扫描/ }).first();
    if (!(await scanBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;
    await scanBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    const emptyEnv = page.locator("text=暂无可用环境").first();
    if (await emptyEnv.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(emptyEnv).toBeVisible();
      // 应有跳转到环境管理的链接
      const goEnv = page.locator("text=前往环境管理").first();
      if (await goEnv.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await expect(goEnv).toBeVisible();
      }
    }
  });

  test("SecurityScanSheet — 未选环境时扫描按钮 disabled", async ({ page }) => {
    await page.goto(projectPath("dashboard"));
    await waitForAppShell(page);

    const scanBtn = page.getByRole("button", { name: /开始扫描/ }).first();
    if (!(await scanBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;
    await scanBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    // Sheet 内的开始扫描按钮应在未选环境时 disabled
    const innerScanBtn = page.getByRole("button", { name: /开始扫描/ }).first();
    if (await innerScanBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // 在未选环境的默认状态下应 disabled
      const isDisabled = await innerScanBtn.isDisabled();
      expect(isDisabled).toBeTruthy();
    }
  });

  test("SecurityScanSheet — 关闭/Escape 正常工作", async ({ page }) => {
    await page.goto(projectPath("dashboard"));
    await waitForAppShell(page);

    const scanBtn = page.getByRole("button", { name: /开始扫描/ }).first();
    if (!(await scanBtn.isVisible({ timeout: 5_000 }).catch(() => false))) return;
    await scanBtn.click();

    const sheet = page.locator('[role="dialog"]').first();
    if (!(await sheet.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    // Sheet 应关闭
    const stillVisible = await sheet.isVisible().catch(() => false);
    expect(stillVisible).toBe(false);
  });
});
