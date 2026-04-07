import type { Page } from "@playwright/test";
import { TEST_PROJECT_ID } from "../fixtures/base";

export class SecurityPage {
  constructor(private page: Page) {}

  /** Security report 需要 taskId，暂时不做独立页面测试 */
  get url() {
    return `/p/${TEST_PROJECT_ID}/settings`;
  }

  async goto() {
    await this.page.goto(this.url);
    await this.page.waitForLoadState("networkidle");
  }
}
