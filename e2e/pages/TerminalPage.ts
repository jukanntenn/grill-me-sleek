/**
 * 终态页面（完成/取消/过期）
 */

import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class TerminalPage extends BasePage {
  readonly title: Locator;
  readonly body: Locator;

  constructor(page: Page) {
    super(page);
    this.title = page.getByRole('heading');
    this.body = page.getByTestId('terminal-body');
  }

  /**
   * 验证页面显示
   */
  async expectVisible() {
    await expect(this.title).toBeVisible();
  }

  /**
   * 验证完成页面
   */
  async expectCompleted() {
    await expect(this.title).toHaveText(/completed/i);
  }

  /**
   * 验证取消页面
   */
  async expectCancelled(reason?: string) {
    await expect(this.title).toHaveText(/cancelled/i);
    if (reason) {
      await expect(this.body).toContainText(reason);
    }
  }

  /**
   * 验证过期页面
   */
  async expectExpired() {
    await expect(this.title).toHaveText(/expired/i);
  }

  /**
   * 验证连接丢失页面
   */
  async expectConnectionLost() {
    await expect(this.title).toHaveText(/connection lost/i);
  }

  /**
   * 验证无效链接页面
   */
  async expectInvalidLink() {
    await expect(this.title).toHaveText(/invalid link/i);
  }
}
