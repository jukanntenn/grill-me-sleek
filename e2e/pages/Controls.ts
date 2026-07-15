/**
 * 控制组件（主题/语言切换）
 */

import { type Page, type Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class Controls extends BasePage {
  readonly themeSelect: Locator;
  readonly languageSelect: Locator;

  constructor(page: Page) {
    super(page);
    // 前端 Controls 使用原生 <select>。aria-label 会随语言变化，
    // 因此用第二个 combobox（语言）来定位。
    const comboboxes = page.getByRole('combobox');
    this.themeSelect = comboboxes.nth(0);
    this.languageSelect = comboboxes.nth(1);
  }

  /**
   * 切换主题
   */
  async switchTheme(theme: 'light' | 'dark' | 'system') {
    await this.themeSelect.selectOption(theme);
  }

  /**
   * 切换语言
   */
  async switchLanguage(language: string) {
    await this.languageSelect.selectOption(language);
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
