import type { Page } from "@playwright/test";
import { TEST_PROJECT_ID } from "../fixtures/base";

export class EnvironmentsPage {
  constructor(private page: Page) {}

  get url() {
    return `/p/${TEST_PROJECT_ID}/environments`;
  }

  async goto() {
    await this.page.goto(this.url);
    await this.page.waitForLoadState("networkidle");
  }

  /** "新增环境" 按钮 */
  get addEnvButton() {
    return this.page.getByRole("button", { name: /新增|添加|创建/ });
  }
}
