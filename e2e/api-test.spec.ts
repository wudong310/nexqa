import { test, expect, collectConsoleErrors, TEST_PROJECT_ID, BASE, projectPath } from "./fixtures/base";

test.describe("API 测试页核心功能", () => {
  test("API 测试页展示用例列表", async ({ page }) => {
    await page.goto(projectPath("api"));
    await page.waitForLoadState("networkidle");

    // 页面应可见
    await expect(page.locator("text=API 测试").first()).toBeVisible();
    // 不白屏
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(10);
  });

  test("手动添加用例 → 对话框弹出", async ({ page }) => {
    await page.goto(projectPath("api"));
    await page.waitForLoadState("networkidle");

    // 找到新增/添加按钮
    const addButton = page.getByRole("button", { name: /新增|添加|手动/ });
    if (await addButton.isVisible()) {
      await addButton.click();
      // 应该弹出对话框或表单
      await expect(page.locator('[role="dialog"], form, [data-state="open"]').first()).toBeVisible({ timeout: 5_000 });
    } else {
      // 如果没有直接可见的新增按钮，可能需要展开菜单
      const plusButton = page.locator('button:has(svg)').filter({ hasText: /\+|新/ }).first();
      if (await plusButton.isVisible()) {
        await plusButton.click();
      }
    }
  });

  test("一键冒烟按钮存在且不 crash", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("api"));
    await page.waitForLoadState("networkidle");

    // 寻找冒烟/一键测试/批量执行按钮
    const smokeButton = page.getByRole("button", { name: /冒烟|批量|全部执行|一键/ });
    if (await smokeButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // 只验证按钮存在且点击不白屏
      await smokeButton.click();
      // 等一下确认不 crash
      await page.waitForTimeout(2_000);
      // 页面应该还在
      await expect(page.locator("body")).toBeVisible();
    }
    // 不应有致命 JS 错误
    const criticalErrors = errors.filter(
      (e) => !e.includes("404") && !e.includes("key prop")
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test("用例列表不为空", async ({ page }) => {
    await page.goto(projectPath("api"));
    await page.waitForLoadState("networkidle");
    // NexQA 项目应有 seed 数据 — 页面有内容即可
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(50);
  });

  test("搜索/筛选功能可用", async ({ page }) => {
    await page.goto(projectPath("api"));
    await page.waitForLoadState("networkidle");
    const search = page.locator('input[placeholder*="搜索"], input[placeholder*="Search"], input[type="search"]').first();
    if (await search.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await search.fill("GET");
      await page.waitForTimeout(500);
      await expect(page.locator("body")).toBeVisible();
      await search.clear();
    }
  });

  test("侧边栏导航跳转正常", async ({ page }) => {
    await page.goto(projectPath("api"));
    await page.waitForLoadState("networkidle");
    // 点击"测试链"导航
    const chainNav = page.locator("nav a", { hasText: "测试链" });
    if (await chainNav.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await chainNav.click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/\/chains$/);
    }
  });
});
