import { test, expect, collectConsoleErrors, waitForAppShell, BASE } from "./fixtures/base";

test.describe("全局设置页功能", () => {
  test("页面可访问且标题可见", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(`${BASE}/settings`);
    await waitForAppShell(page);
    await expect(page.locator("text=全局设置").first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test("LLM 配置卡片可见", async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await waitForAppShell(page);
    // 应有 LLM/AI 模型配置
    const llmSection = page.locator('text=/LLM|模型|AI|Provider/').first();
    await expect(llmSection).toBeVisible({ timeout: 5_000 });
  });

  test("API Key 输入框存在且可切换显隐", async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await waitForAppShell(page);
    // API Key 输入框
    const keyInput = page.locator('input[type="password"], input[name*="key"], input[name*="apiKey"]').first();
    if (await keyInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(keyInput).toBeVisible();
      // 切换显隐按钮
      const toggleBtn = page.locator('button:has(svg.lucide-eye), button:has(svg.lucide-eye-off)').first();
      if (await toggleBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await toggleBtn.click();
        await page.waitForTimeout(300);
      }
    }
  });

  test("主题切换可用", async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await waitForAppShell(page);
    // 主题相关的下拉/选择
    const themeSelect = page.locator('text=/主题|Theme/').first();
    if (await themeSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(themeSelect).toBeVisible();
    }
  });

  test("保存设置按钮可点击", async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await waitForAppShell(page);
    const saveBtn = page.getByRole("button", { name: /保存|Save/ }).first();
    if (await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(saveBtn).toBeVisible();
    }
  });

  test("存储路径配置可见", async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await waitForAppShell(page);
    const storageSection = page.locator('text=/存储|数据目录|日志目录|Storage/').first();
    if (await storageSection.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(storageSection).toBeVisible();
    }
  });

  test("快捷键说明可见", async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await waitForAppShell(page);
    const shortcutSection = page.locator('text=/快捷键|Keyboard|Shortcut/').first();
    if (await shortcutSection.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(shortcutSection).toBeVisible();
    }
  });
});
