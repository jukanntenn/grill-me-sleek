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
    // 使用问题 id 对应的 data-testid 作为定位器，避免依赖 header 文本
    this.container = page.locator(`[data-testid="question-${questionId}"]`);
  }

  /**
   * 选择选项（单选/多选）
   * 选项 label 可能附带 "Recommended" 徽章，点击 label 本身比点击文本 span 更稳定。
   */
  async selectOption(optionLabel: string) {
    await this.container.locator('label').filter({ hasText: optionLabel }).click();
  }

  /**
   * 选择"无"选项（单选题专用）
   */
  async selectNoneOption() {
    await this.container.locator('label').filter({ hasText: /none of the above|以上选项都不符合/i }).click();
  }

  /**
   * 填写文本
   */
  async fillText(text: string) {
    await this.container.locator('textarea, input[type="text"]').fill(text);
  }

  /**
   * 选择评分
   * 评分按钮可能附带 "(recommended)" 文本，使用 role + 正则匹配。
   */
  async selectRating(value: number) {
    await this.container
      .getByRole('button', { name: new RegExp(`^${value}`) })
      .click();
  }

  /**
   * 选择是/否
   * 按钮文本可能附带 "(recommended)" 文本，使用 role + 正则匹配。
   */
  async selectYesNo(value: 'yes' | 'no') {
    await this.container
      .getByRole('button', { name: new RegExp(value, 'i') })
      .click();
  }

  /**
   * 填写自定义文本
   */
  async fillCustomText(text: string) {
    await this.container.locator(`[data-testid="custom-text-${this.questionId}"]`).fill(text);
  }

  /**
   * 获取容器
   */
  getContainer(): Locator {
    return this.container;
  }

  /**
   * 验证选项是否被选中
   */
  async expectOptionSelected(optionLabel: string) {
    const option = this.container.locator('label').filter({ hasText: optionLabel });
    await expect(option).toHaveAttribute('data-selected', 'true');
  }

  /**
   * 验证"无"选项是否被选中
   */
  async expectNoneOptionSelected() {
    const noneOption = this.container.locator('label').filter({ hasText: /none of the above|以上选项都不符合/i });
    await expect(noneOption).toHaveAttribute('data-selected', 'true');
  }

  /**
   * 验证推荐标记是否显示
   */
  async expectRecommendedMark() {
    await expect(this.container.getByText(/recommended|推荐/)).toBeVisible();
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

  // 轮次显示
  readonly roundIndicator: Locator;

  constructor(page: Page) {
    super(page);
    // QuestionCard 使用 question-${id} 作为 testid
    this.questionCards = page.locator('[data-testid^="question-"]');
    this.submitButton = page.getByRole('button', { name: /submit/i });
    this.additionalNotesInput = page.getByTestId('additional-notes').locator('textarea');
    this.errorBanner = page.getByRole('alert');
    this.retryButton = page.getByRole('button', { name: /retry/i });
    this.waitingMessage = page.getByText(/waiting for next round/i);
    // 轮次显示
    this.roundIndicator = page.locator('div').filter({ hasText: /round|轮次/ }).first();
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
   * 选择单选题的"无"选项
   */
  async selectSingleNoneOption(questionId: string) {
    const question = this.getQuestion(questionId);
    await question.selectNoneOption();
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

  /**
   * 验证轮次显示
   */
  async expectRoundIndicator(roundNumber: number, roundName?: string) {
    if (roundName) {
      await expect(this.page.getByText(new RegExp(`round ${roundNumber}.*${roundName}|第 ${roundNumber} 轮.*${roundName}`))).toBeVisible({ timeout: 10000 });
    } else {
      await expect(this.page.getByText(new RegExp(`round ${roundNumber}|第 ${roundNumber} 轮`))).toBeVisible({ timeout: 10000 });
    }
  }

  /**
   * 验证轮次显示在问卷标题上方
   */
  async expectRoundIndicatorAboveTitle() {
    const roundIndicator = this.page.locator('div').filter({ hasText: /round|轮次/ }).first();
    const title = this.page.locator('h1').first();

    // 获取两个元素的位置
    const roundBox = await roundIndicator.boundingBox();
    const titleBox = await title.boundingBox();

    if (roundBox && titleBox) {
      expect(roundBox.y).toBeLessThan(titleBox.y);
    }
  }

  /**
   * 验证推荐选项是否自动选中
   */
  async expectRecommendedOptionSelected(questionId: string) {
    const question = this.getQuestion(questionId);
    await question.expectRecommendedMark();
  }
}
