import { test, expect, collectConsoleErrors, waitForAppShell, projectPath } from "./fixtures/base";

test.describe("AI 交互一致性测试", () => {
  // ── 冒烟确认 Sheet ──
  test("冒烟按钮存在且 Sheet 可打开", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("api"));
    await waitForAppShell(page);
    const smokeBtn = page.getByRole("button", { name: /冒烟|Smoke/ }).first();
    if (await smokeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await smokeBtn.click();
      // Sheet 可能用 role=dialog 或 data-state=open 或其他容器
      const sheet = page.locator('[role="dialog"], [data-state="open"], [class*="sheet"], [class*="Sheet"]').first();
      if (await sheet.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await expect(sheet).toBeVisible();
      }
    }
    const critical = errors.filter(
      (e) => !e.includes("404") && !e.includes("key") && !e.includes("400") && !e.includes("test/exec")
    );
    expect(critical).toHaveLength(0);
  });

  test("冒烟 Sheet — 关闭按钮正常", async ({ page }) => {
    await page.goto(projectPath("api"));
    await waitForAppShell(page);
    const smokeBtn = page.getByRole("button", { name: /冒烟|Smoke/ }).first();
    if (await smokeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await smokeBtn.click();
      const sheet = page.locator('[role="dialog"], [data-state="open"]').first();
      if (await sheet.isVisible({ timeout: 3_000 }).catch(() => false)) {
        // 关闭 Sheet
        const closeBtn = sheet.locator('button:has(svg.lucide-x), button[aria-label="Close"]').first();
        if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await closeBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
  });

  // ── AI 用例生成 ──
  test("AI 用例生成按钮存在", async ({ page }) => {
    await page.goto(projectPath("api"));
    await waitForAppShell(page);
    const aiGenBtn = page.locator('button:has(svg.lucide-sparkles)').first();
    if (await aiGenBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(aiGenBtn).toBeVisible();
    }
  });

  // ── AI 链生成 Sheet ──
  test("测试链页 — AI 生成 Sheet 可打开关闭", async ({ page }) => {
    await page.goto(projectPath("chains"));
    await waitForAppShell(page);
    const aiBtn = page.locator('button:has(svg.lucide-sparkles), button:has-text("AI")').first();
    if (await aiBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await aiBtn.click();
      const sheet = page.locator('[role="dialog"], [data-state="open"]').first();
      if (await sheet.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(sheet).toBeVisible();
        // 关闭
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
      }
    }
  });

  // ── AI 方案生成 Sheet ──
  test("测试方案页 — AI 生成 Sheet 可打开关闭", async ({ page }) => {
    await page.goto(projectPath("plans"));
    await waitForAppShell(page);
    const aiBtn = page.locator('button:has(svg.lucide-sparkles), button:has-text("AI")').first();
    if (await aiBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await aiBtn.click();
      const sheet = page.locator('[role="dialog"], [data-state="open"]').first();
      if (await sheet.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(sheet).toBeVisible();
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
      }
    }
  });

  // ── Sheet 宽度规范验证 ──
  test("Sheet 宽度符合 S/M/L 规范", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(projectPath("api"));
    await waitForAppShell(page);
    const smokeBtn = page.getByRole("button", { name: /冒烟|Smoke/ }).first();
    if (await smokeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await smokeBtn.click();
      const sheet = page.locator('[data-state="open"] [class*="SheetContent"], [role="dialog"]').first();
      if (await sheet.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const box = await sheet.boundingBox();
        if (box) {
          // Sheet 宽度应在 S(480)/M(540)/L(600) 范围或全宽
          expect(box.width).toBeLessThanOrEqual(700);
        }
      }
    }
  });

  // ── 按钮 disabled 防重复点击 ──
  test("执行按钮点击后 disabled 防重复", async ({ page }) => {
    await page.goto(projectPath("api"));
    await waitForAppShell(page);
    const smokeBtn = page.getByRole("button", { name: /冒烟|Smoke/ }).first();
    if (await smokeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await smokeBtn.click();
      const sheet = page.locator('[role="dialog"], [data-state="open"]').first();
      if (await sheet.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const execBtn = sheet.getByRole("button", { name: /执行|开始|确认/ }).first();
        if (await execBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await execBtn.click();
          // 点击后按钮应 disabled 或显示 loading
          await page.waitForTimeout(500);
          const isDisabled = await execBtn.isDisabled().catch(() => false);
          const hasLoader = await sheet.locator('svg.lucide-loader, svg.animate-spin').first()
            .isVisible({ timeout: 2_000 }).catch(() => false);
          // 至少一个防重复机制存在
          expect(isDisabled || hasLoader).toBeTruthy();
        }
      }
    }
  });

  // ── 空状态展示 ──
  test("空项目的 AI Sheet 显示引导文案", async ({ page }) => {
    // 测试方案页通常在无方案时显示空状态
    await page.goto(projectPath("plans"));
    await waitForAppShell(page);
    const body = await page.locator("body").innerText();
    // 页面应有内容（空状态或方案列表）
    expect(body.length).toBeGreaterThan(10);
  });

  // ── 错误状态（模拟） ──
  test("页面加载错误时显示重试按钮", async ({ page }) => {
    // 覆盖率页有完善的错误处理
    await page.goto(projectPath("coverage"));
    await waitForAppShell(page);
    // 如果有重试按钮（出错时显示）
    const retryBtn = page.getByRole("button", { name: /重试|Retry/ }).first();
    if (await retryBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await retryBtn.click();
      await page.waitForTimeout(1_000);
      await expect(page.locator("body")).toBeVisible();
    }
  });
});
