/**
 * 控制组件（主题/语言切换）
 */

import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class Controls extends BasePage {
  readonly themeButton: Locator;
  readonly languageButton: Locator;

  constructor(page: Page) {
    super(page);
    this.themeButton = page.getByRole('button', { name: /theme/i });
    this.languageButton = page.getByRole('button', { name: /language/i });
  }

  /**
   * 切换主题
   */
  async switchTheme(theme: 'light' | 'dark' | 'system') {
    await this.themeButton.click();
    await this.page.getByText(theme, { exact: false }).click();
  }

  /**
   * 切换语言
   */
  async switchLanguage(language: string) {
    await this.languageButton.click();
    await this.page.getByText(language).click();
  }

  /**
   * 获取当前主题
   */
  async getCurrentTheme(): Promise<string> {
    const theme = await this.page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') ?? 'light';
    });
    return theme;
  }
}
