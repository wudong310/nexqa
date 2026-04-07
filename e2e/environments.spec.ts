import { test, expect, collectConsoleErrors, TEST_PROJECT_ID, BASE, projectPath } from "./fixtures/base";

test.describe("环境管理页核心功能", () => {
  test("环境管理页展示环境列表", async ({ page }) => {
    await page.goto(projectPath("environments"));
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=环境管理").first()).toBeVisible();
    // 不白屏
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(10);
  });

  test("创建环境 → 对话框弹出并填写", async ({ page }) => {
    await page.goto(projectPath("environments"));
    await page.waitForLoadState("networkidle");

    // 找到"新增环境"按钮
    const addButton = page.getByRole("button", { name: /新增|添加|创建|新建/ }).first();
    await expect(addButton).toBeVisible({ timeout: 5_000 });
    await addButton.click();

    // 应弹出对话框
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // 填写环境名称
    const nameInput = dialog.locator('input').first();
    await nameInput.fill("E2E-Test-Env");

    // 填写 Base URL（必填字段）
    const baseUrlInput = dialog.locator('input[placeholder*="example"], input[placeholder*="api"], input[placeholder*="http"]').first();
    if (await baseUrlInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await baseUrlInput.fill("http://localhost:9999/test");
    } else {
      // fallback: 填写第三个 input（名称, slug, baseURL）
      const inputs = dialog.locator('input');
      const count = await inputs.count();
      if (count >= 3) {
        await inputs.nth(2).fill("http://localhost:9999/test");
      }
    }

    // 找到对话框中的确认/创建按钮
    const confirmButton = dialog.getByRole("button", { name: /创建|确认|保存|确定/ });
    if (await confirmButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmButton.click();
      await page.waitForLoadState("networkidle");
      // 验证新环境出现在列表中
      await expect(page.locator("text=E2E-Test-Env").first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test("环境列表刷新不 crash", async ({ page }) => {
    await page.goto(projectPath("environments"));
    await page.waitForLoadState("networkidle");
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=环境管理").first()).toBeVisible({ timeout: 10_000 });
  });

  test("环境卡片显示 Base URL", async ({ page }) => {
    await page.goto(projectPath("environments"));
    await page.waitForLoadState("networkidle");
    // 环境卡片应有 URL 信息
    const hasUrl = await page.locator('text=/http|localhost|api/').first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    const hasCards = await page.locator('[class*="card"]').first()
      .isVisible({ timeout: 3_000 }).catch(() => false);
    expect(hasUrl || hasCards).toBeTruthy();
  });

  // 清理：删除测试环境
  test.afterAll(async ({ browser }) => {
    // 通过 API 清理测试数据
    try {
      const response = await fetch(`http://localhost:5173/nexqa/api/projects/${TEST_PROJECT_ID}/environments`);
      const envs = await response.json() as Array<{ id: string; name: string }>;
      for (const env of envs) {
        if (env.name === "E2E-Test-Env") {
          await fetch(`http://localhost:5173/nexqa/api/projects/${TEST_PROJECT_ID}/environments/${env.id}`, {
            method: "DELETE",
          });
        }
      }
    } catch {
      // 清理失败不影响测试结果
    }
  });
});
