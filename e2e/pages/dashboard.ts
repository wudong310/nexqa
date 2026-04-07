import type { Page } from "@playwright/test";
import { TEST_PROJECT_ID } from "../fixtures/base";

export class DashboardPage {
  constructor(private page: Page) {}

  get url() {
    return `/p/${TEST_PROJECT_ID}/dashboard`;
  }

  async goto() {
    await this.page.goto(this.url);
    await this.page.waitForLoadState("networkidle");
  }

  /** 侧边栏"概览"导航链接 */
  get navLink() {
    return this.page.locator('a[href*="/dashboard"]');
  }
}
