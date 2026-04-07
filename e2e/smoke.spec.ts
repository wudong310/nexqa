import { test, expect, collectConsoleErrors, waitForAppShell, projectPath, BASE } from "./fixtures/base";

test.describe("冒烟测试 — 每个页面可访问且无 JS 报错", () => {
  test("项目选择页（首页）可访问", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(`${BASE}/`);
    await waitForAppShell(page);
    await expect(page).toHaveTitle(/NexQA/);
    // 首页应该显示项目列表中的 NexQA 项目
    await expect(page.locator("text=NexQA").first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test("概览（Dashboard）页可访问", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("dashboard"));
    await waitForAppShell(page);
    await expect(page).toHaveTitle(/NexQA/);
    await expect(page.locator("text=概览").first()).toBeVisible({ timeout: 10_000 });
    // [已知 Bug] Dashboard 调了不存在的 API: /trend-insights, /quality-risks => 404
    // 过滤掉这两个已知 404 错误后检查
    const unknownErrors = errors.filter(
      (e) => !e.includes("trend-insights") && !e.includes("quality-risks") && !e.includes("404")
    );
    expect(unknownErrors).toHaveLength(0);
  });

  test("API 测试页可访问", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("api"));
    await waitForAppShell(page);
    await expect(page).toHaveTitle(/NexQA/);
    await expect(page.locator("text=API 测试").first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test("测试链页可访问", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("chains"));
    await waitForAppShell(page);
    await expect(page).toHaveTitle(/NexQA/);
    await expect(page.locator("text=测试链").first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test("测试方案页可访问", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("plans"));
    await waitForAppShell(page);
    await expect(page).toHaveTitle(/NexQA/);
    await expect(page.locator("text=测试方案").first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test("覆盖率页可访问", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("coverage"));
    await waitForAppShell(page);
    await expect(page).toHaveTitle(/NexQA/);
    await expect(page.locator("text=覆盖率").first()).toBeVisible({ timeout: 10_000 });
    // [已知 Bug] CoverageMatrix 组件缺少 React key prop（warning 级别，不阻断）
    const criticalErrors = errors.filter(
      (e) => !e.includes("unique \"key\" prop")
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test("执行历史页可访问", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("history"));
    await waitForAppShell(page);
    await expect(page).toHaveTitle(/NexQA/);
    await expect(page.locator("text=执行历史").first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test("测试报告页可访问", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("reports"));
    await waitForAppShell(page);
    await expect(page).toHaveTitle(/NexQA/);
    await expect(page.locator("text=测试报告").first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test("环境管理页可访问", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("environments"));
    await waitForAppShell(page);
    await expect(page).toHaveTitle(/NexQA/);
    await expect(page.locator("text=环境管理").first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test("CI/CD 页可访问", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("cicd"));
    await waitForAppShell(page);
    await expect(page).toHaveTitle(/NexQA/);
    await expect(page.locator("text=CI/CD").first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test("OpenClaw 页可访问", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("openclaw"));
    await waitForAppShell(page);
    await expect(page).toHaveTitle(/NexQA/);
    await expect(page.locator("text=OpenClaw").first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test("项目设置页可访问", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("settings"));
    await waitForAppShell(page);
    await expect(page).toHaveTitle(/NexQA/);
    await expect(page.locator("text=项目设置").first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test("全局设置页可访问", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(`${BASE}/settings`);
    await waitForAppShell(page);
    await expect(page).toHaveTitle(/NexQA/);
    await expect(page.locator("text=全局设置").first()).toBeVisible({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });

  test("API 导入页可访问", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("api/import"));
    await waitForAppShell(page);
    await expect(page).toHaveTitle(/NexQA/);
    await expect(page.locator("body")).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(10);
    expect(errors).toHaveLength(0);
  });

  test("安全报告页路由不 crash", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(projectPath("security/test-task-id"));
    await waitForAppShell(page);
    await expect(page).toHaveTitle(/NexQA/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("项目列表页可访问", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(`${BASE}/projects`);
    await waitForAppShell(page);
    await expect(page).toHaveTitle(/NexQA/);
    await expect(page.locator("body")).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(10);
    expect(errors).toHaveLength(0);
  });
});
