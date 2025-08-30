import { Page } from '@playwright/test';

export class HomePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    // Try a few URL variants to be resilient to DNS/redirect issues
    const candidates = [
      'https://www.saucedemo.com/'
    ];
    let lastError: unknown;
    for (const url of candidates) {
      try {
        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  async getTitle(): Promise<string> {
    return this.page.title();
  }
}
