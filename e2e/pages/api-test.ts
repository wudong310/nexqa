import type { Page } from "@playwright/test";
import { TEST_PROJECT_ID } from "../fixtures/base";

export class ApiTestPage {
  constructor(private page: Page) {}

  get url() {
    return `/p/${TEST_PROJECT_ID}/api`;
  }

  async goto() {
    await this.page.goto(this.url);
    await this.page.waitForLoadState("networkidle");
  }

  /** "新增用例" 按钮 */
  get addCaseButton() {
    return this.page.getByRole("button", { name: /新增|添加|新建/ });
  }
}
