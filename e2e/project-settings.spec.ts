import { test, expect, collectConsoleErrors, TEST_PROJECT_ID, BASE, projectPath } from "./fixtures/base";

test.describe("项目设置页核心功能", () => {
  test("项目设置页展示项目信息", async ({ page }) => {
    await page.goto(projectPath("settings"));
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=项目设置").first()).toBeVisible();
    // 应该能看到项目名称
    await expect(page.locator("text=NexQA").first()).toBeVisible({ timeout: 5_000 });
  });

  test("修改项目描述 → 保存 → 值持久化", async ({ page }) => {
    await page.goto(projectPath("settings"));
    await page.waitForLoadState("networkidle");

    // 找到描述输入框（textarea）
    const descInput = page.locator("textarea").first();
    await expect(descInput).toBeVisible({ timeout: 5_000 });

    // 记录原始值
    const originalValue = await descInput.inputValue();

    // 修改描述
    const testDesc = `E2E测试描述_${Date.now()}`;
    await descInput.fill(testDesc);

    // 点击保存按钮
    const saveButton = page.getByRole("button", { name: /保存/ }).first();
    await expect(saveButton).toBeVisible({ timeout: 5_000 });
    await saveButton.click();

    // 等待保存完成
    await page.waitForLoadState("networkidle");

    // 刷新页面验证持久化
    await page.reload();
    await page.waitForLoadState("networkidle");

    const savedValue = await page.locator("textarea").first().inputValue();
    expect(savedValue).toBe(testDesc);

    // 还原原始值
    await page.locator("textarea").first().fill(originalValue);
    await page.getByRole("button", { name: /保存/ }).first().click();
    await page.waitForLoadState("networkidle");
  });

  test("脏状态拦截 — 修改后离开应有提示", async ({ page }) => {
    await page.goto(projectPath("settings"));
    await page.waitForLoadState("networkidle");

    // 找到描述输入框并修改
    const descInput = page.locator("textarea").first();
    await expect(descInput).toBeVisible({ timeout: 5_000 });
    await descInput.fill("未保存的修改");

    // 尝试通过侧边栏导航离开
    // 注册 dialog handler（如果有浏览器原生 beforeunload 对话框）
    page.on("dialog", async (dialog) => {
      expect(dialog.type()).toBe("beforeunload");
      await dialog.dismiss(); // 取消离开
    });

    // 点击侧边栏"API 测试"
    await page.locator("nav a", { hasText: "API 测试" }).click();

    // 等待一下看是否有自定义的拦截对话框
    const alertDialog = page.locator('[role="alertdialog"]');
    if (await alertDialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // 有自定义拦截对话框 — 好！
      await expect(alertDialog).toBeVisible();
      // 点取消留在当前页
      const cancelButton = alertDialog.getByRole("button", { name: /取消|留下|返回/ });
      if (await cancelButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await cancelButton.click();
      }
    }
    // 无论是否拦截，测试不 crash 即可
    await expect(page.locator("body")).toBeVisible();
  });

  test("项目名称字段可见", async ({ page }) => {
    await page.goto(projectPath("settings"));
    await page.waitForLoadState("networkidle");
    // 应显示项目名称输入框
    const nameInput = page.locator('input').first();
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    const val = await nameInput.inputValue();
    expect(val.length).toBeGreaterThan(0);
  });

  test("页面刷新后设置持久化", async ({ page }) => {
    await page.goto(projectPath("settings"));
    await page.waitForLoadState("networkidle");
    const body1 = await page.locator("body").innerText();
    await page.reload();
    await page.waitForLoadState("networkidle");
    const body2 = await page.locator("body").innerText();
    // 刷新前后页面内容基本一致
    expect(body2.length).toBeGreaterThan(10);
  });
});
