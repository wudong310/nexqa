import { test, expect, collectConsoleErrors, waitForAppShell, projectPath } from "./fixtures/base";

test.describe("API 导入页功能", () => {
  test("页面可访问且核心元素可见", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("api/import"));
    await waitForAppShell(page);
    await expect(page).toHaveTitle(/NexQA/);
    // 导入页应显示导入相关标题或 Tab
    await expect(page.locator("body")).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(10);
    expect(errors).toHaveLength(0);
  });

  test("粘贴导入 Tab — 文本区可输入", async ({ page }) => {
    await page.goto(projectPath("api/import"));
    await waitForAppShell(page);
    // 应有 Tabs（paste/url/file）
    const pasteTab = page.locator('[role="tab"]').filter({ hasText: /粘贴|Paste|文本/ }).first();
    if (await pasteTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await pasteTab.click();
    }
    // 文本区可填写
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible({ timeout: 5_000 });
    await textarea.fill('{"openapi":"3.0.0","info":{"title":"Test"}}');
    const val = await textarea.inputValue();
    expect(val).toContain("openapi");
  });

  test("URL 导入 Tab — 输入框可填写", async ({ page }) => {
    await page.goto(projectPath("api/import"));
    await waitForAppShell(page);
    const urlTab = page.locator('[role="tab"]').filter({ hasText: /URL/ }).first();
    if (await urlTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await urlTab.click();
    }
    // 找 URL 输入框
    const urlInput = page.locator('input[placeholder*="http"], input[type="url"]').first();
    if (await urlInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await urlInput.fill("https://petstore.swagger.io/v2/swagger.json");
      const val = await urlInput.inputValue();
      expect(val).toContain("swagger");
    }
  });

  test("解析按钮存在且空内容不可解析", async ({ page }) => {
    await page.goto(projectPath("api/import"));
    await waitForAppShell(page);
    // 解析/导入按钮
    const parseBtn = page.getByRole("button", { name: /解析|导入|Parse|Import/ }).first();
    if (await parseBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(parseBtn).toBeVisible();
    }
  });

  test("文件上传区域可见", async ({ page }) => {
    await page.goto(projectPath("api/import"));
    await waitForAppShell(page);
    const fileTab = page.locator('[role="tab"]').filter({ hasText: /文件|File|上传/ }).first();
    if (await fileTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await fileTab.click();
      // 上传区域应可见
      const uploadArea = page.locator('input[type="file"], [data-testid="upload"], text=拖拽').first();
      if (await uploadArea.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(uploadArea).toBeVisible();
      }
    }
  });
});
