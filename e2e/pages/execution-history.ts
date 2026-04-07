import type { Page } from "@playwright/test";
import { TEST_PROJECT_ID } from "../fixtures/base";

export class ExecutionHistoryPage {
  constructor(private page: Page) {}

  get url() {
    return `/p/${TEST_PROJECT_ID}/history`;
  }

  async goto() {
    await this.page.goto(this.url);
    await this.page.waitForLoadState("networkidle");
  }
}
