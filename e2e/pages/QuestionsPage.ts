/**
 * 问题页面
 */

import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * 问题控件
 */
class QuestionControl {
  private container: Locator;

  constructor(
    private page: Page,
    private questionId: string
  ) {
    // 使用问题文本作为定位器
    this.container = page.locator('label').filter({ hasText: questionId }).locator('..');
  }

  /**
   * 选择选项（单选/多选）
   */
  async selectOption(optionLabel: string) {
    await this.container.getByText(optionLabel).click();
  }

  /**
   * 填写文本
   */
  async fillText(text: string) {
    await this.container.locator('textarea, input[type="text"]').fill(text);
  }

  /**
   * 选择评分
   */
  async selectRating(value: number) {
    await this.container.getByText(String(value)).click();
  }

  /**
   * 选择是/否
   */
  async selectYesNo(value: 'yes' | 'no') {
    await this.container.getByText(value, { exact: false }).click();
  }

  /**
   * 填写自定义文本
   */
  async fillCustomText(text: string) {
    await this.container.getByText(/custom/i).click();
    await this.container.locator('textarea, input[type="text"]').last().fill(text);
  }

  /**
   * 获取容器
   */
  getContainer(): Locator {
    return this.container;
  }
}

/**
 * 问题页面
 */
export class QuestionsPage extends BasePage {
  // 问题卡片（使用通用选择器）
  readonly questionCards: Locator;

  // 提交按钮
  readonly submitButton: Locator;

  // 额外备注输入框
  readonly additionalNotesInput: Locator;

  // 错误横幅
  readonly errorBanner: Locator;

  // 重试按钮
  readonly retryButton: Locator;

  // 等待提示
  readonly waitingMessage: Locator;

  constructor(page: Page) {
    super(page);
    // 使用问题标题作为定位器
    this.questionCards = page.locator('label').filter({ hasText: /\*/ });
    this.submitButton = page.getByRole('button', { name: /submit/i });
    this.additionalNotesInput = page.getByLabel(/additional notes/i);
    this.errorBanner = page.getByRole('alert');
    this.retryButton = page.getByRole('button', { name: /retry/i });
    this.waitingMessage = page.getByText(/waiting for next round/i);
  }

  /**
   * 获取指定问题的控件
   */
  getQuestion(questionId: string): QuestionControl {
    return new QuestionControl(this.page, questionId);
  }

  /**
   * 填写单选题
   */
  async selectSingleOption(questionId: string, optionLabel: string) {
    const question = this.getQuestion(questionId);
    await question.selectOption(optionLabel);
  }

  /**
   * 填写多选题
   */
  async selectMultipleOptions(questionId: string, optionLabels: string[]) {
    const question = this.getQuestion(questionId);
    for (const label of optionLabels) {
      await question.selectOption(label);
    }
  }

  /**
   * 填写文本题
   */
  async fillText(questionId: string, text: string) {
    const question = this.getQuestion(questionId);
    await question.fillText(text);
  }

  /**
   * 填写额外备注
   */
  async fillAdditionalNotes(notes: string) {
    await this.additionalNotesInput.fill(notes);
  }

  /**
   * 提交响应
   */
  async submit() {
    await this.submitButton.click();
  }

  /**
   * 等待提交成功
   */
  async waitForSubmitSuccess() {
    await expect(this.page.getByText('Waiting for the next round')).toBeVisible({ timeout: 10000 });
  }

  /**
   * 等待错误提示
   */
  async waitForError() {
    await expect(this.errorBanner).toBeVisible({ timeout: 10000 });
  }

  /**
   * 重试提交
   */
  async retry() {
    await this.retryButton.click();
  }

  /**
   * 验证问题数量
   */
  async expectQuestionCount(count: number) {
    await expect(this.questionCards).toHaveCount(count, { timeout: 10000 });
  }

  /**
   * 验证问题文本
   */
  async expectQuestionText(text: string) {
    await expect(this.page.getByText(text)).toBeVisible({ timeout: 10000 });
  }
}
