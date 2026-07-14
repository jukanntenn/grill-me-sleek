/**
 * 基础页面类
 */

import { type Page, type Locator } from '@playwright/test';

export abstract class BasePage {
  constructor(protected page: Page) {}
  
  /**
   * 导航到页面
   */
  async goto(url: string) {
    await this.page.goto(url);
  }
  
  /**
   * 等待页面加载完成
   */
  async waitForLoad() {
    // 使用 domcontentloaded 而不是 networkidle，因为 SSE 连接会导致 networkidle 超时
    await this.page.waitForLoadState('domcontentloaded');
    // 等待一小段时间让页面渲染完成
    await this.page.waitForTimeout(1000);
  }
  
  /**
   * 获取页面标题
   */
  async getTitle(): Promise<string> {
    return await this.page.title();
  }
  
  /**
   * 截图
   */
  async screenshot(name: string) {
    await this.page.screenshot({ path: `test-results/${name}.png` });
  }
}
