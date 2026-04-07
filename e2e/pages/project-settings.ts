import type { Page } from "@playwright/test";
import { TEST_PROJECT_ID } from "../fixtures/base";

export class ProjectSettingsPage {
  constructor(private page: Page) {}

  get url() {
    return `/p/${TEST_PROJECT_ID}/settings`;
  }

  async goto() {
    await this.page.goto(this.url);
    await this.page.waitForLoadState("networkidle");
  }

  /** 项目描述输入框 */
  get descriptionInput() {
    return this.page.locator('textarea, input[name*="description"], [data-testid="description"]').first();
  }

  /** 保存按钮 */
  get saveButton() {
    return this.page.getByRole("button", { name: /保存/ });
  }
}
