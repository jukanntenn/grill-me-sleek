/**
 * 用户交互测试
 */

import { test, expect } from '../fixtures';

test.describe('用户交互', () => {
  test('主题切换', async ({ page, basicSession, controls }) => {
    const { session } = basicSession;

    await page.goto(session.url);
    await page.waitForLoadState('domcontentloaded');

    // 验证默认主题
    const defaultTheme = await controls.getCurrentTheme();
    expect(defaultTheme).toBe('light');

    // 切换到深色主题
    await controls.switchTheme('dark');

    // 验证深色主题
    const darkTheme = await controls.getCurrentTheme();
    expect(darkTheme).toBe('dark');

    // 切换回浅色主题
    await controls.switchTheme('light');

    // 验证浅色主题
    const lightTheme = await controls.getCurrentTheme();
    expect(lightTheme).toBe('light');
  });

  test('国际化', async ({ page, basicSession, controls }) => {
    const { session } = basicSession;

    await page.goto(session.url);
    await page.waitForLoadState('domcontentloaded');

    // 验证默认语言（英文）
    await expect(page.getByText('Submit')).toBeVisible();

    // 切换到中文（locale value）
    await controls.switchLanguage('zh-CN');

    // 验证中文
    await expect(page.getByText('提交')).toBeVisible();

    // 切换回英文
    await controls.switchLanguage('en');

    // 验证英文
    await expect(page.getByText('Submit')).toBeVisible();
  });

  test('响应式设计', async ({ page, basicSession }) => {
    const { session } = basicSession;

    // 桌面布局
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(session.url);
    await page.waitForLoadState('domcontentloaded');

    // 验证桌面布局（QuestionCard 现在使用 question-${id} 的 testid）
    const desktopCard = page.locator('[data-testid^="question-"]').first();
    await expect(desktopCard).toBeVisible();

    // 平板布局
    await page.setViewportSize({ width: 768, height: 1024 });

    // 验证平板布局
    await expect(desktopCard).toBeVisible();

    // 手机布局
    await page.setViewportSize({ width: 375, height: 667 });

    // 验证手机布局
    await expect(desktopCard).toBeVisible();
  });

  test('表单验证', async ({ page, allQuestionTypesSession, questionsPage }) => {
    const { session } = allQuestionTypesSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 尝试不填写必填字段提交
    await questionsPage.submit();

    // 验证验证错误
    await expect(page.getByText(/required/i)).toBeVisible();

    // 填写必填字段
    await questionsPage.selectSingleOption('q_single', 'Option A');
    await questionsPage.selectMultipleOptions('q_multi', ['Feature A']);
    await questionsPage.fillText('q_text', 'Some text');
    await questionsPage.getQuestion('q_yesno').selectYesNo('yes');
    await questionsPage.getQuestion('q_rating').selectRating(4);

    // 提交成功
    await questionsPage.submit();
    await questionsPage.waitForSubmitSuccess();
  });

  test('轮次显示功能 - 显示轮次数字和名称', async ({ page, basicSession, questionsPage }) => {
    const { session } = basicSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 验证轮次显示
    await questionsPage.expectRoundIndicator(1, 'Basic Test Session');
  });

  test('轮次显示功能 - 显示在问卷标题上方', async ({ page, basicSession, questionsPage }) => {
    const { session } = basicSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 验证轮次显示在问卷标题上方
    await questionsPage.expectRoundIndicatorAboveTitle();
  });

  test('单选题"无"选项 - 渲染和选择', async ({ page, allQuestionTypesSession, questionsPage }) => {
    const { session } = allQuestionTypesSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 获取单选题控件
    const singleQuestion = questionsPage.getQuestion('q_single');

    // 验证"无"选项存在
    await expect(page.getByText(/none of the above|以上选项都不符合/i)).toBeVisible();

    // 选择"无"选项
    await singleQuestion.selectNoneOption();

    // 验证"无"选项被选中
    await singleQuestion.expectNoneOptionSelected();
  });

  test('单选题"无"选项 - 不影响其他选项', async ({ page, allQuestionTypesSession, questionsPage }) => {
    const { session } = allQuestionTypesSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 获取单选题控件
    const singleQuestion = questionsPage.getQuestion('q_single');

    // 选择普通选项
    await singleQuestion.selectOption('Option A');
    await singleQuestion.expectOptionSelected('Option A');

    // 选择"无"选项
    await singleQuestion.selectNoneOption();
    await singleQuestion.expectNoneOptionSelected();

    // 再次选择普通选项
    await singleQuestion.selectOption('Option B');
    await singleQuestion.expectOptionSelected('Option B');
  });

  test('自动勾选推荐选项 - 单选题', async ({ page, basicSession, questionsPage }) => {
    const { session } = basicSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 验证推荐选项自动选中（第一个选项是推荐的）
    const singleQuestion = questionsPage.getQuestion('q_auth');
    await singleQuestion.expectOptionSelected('JWT');
  });

  test('自动勾选推荐选项 - 多选题', async ({ page, allQuestionTypesSession, questionsPage }) => {
    const { session } = allQuestionTypesSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 验证多选题推荐选项自动选中（第二个选项是推荐的）
    const multiQuestion = questionsPage.getQuestion('q_multi');
    await multiQuestion.expectOptionSelected('Feature B');
  });

  test('自动勾选推荐选项 - 是/否题', async ({ page, allQuestionTypesSession, questionsPage }) => {
    const { session } = allQuestionTypesSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 验证是/否题推荐选项自动选中（推荐"是"）
    const yesnoQuestion = questionsPage.getQuestion('q_yesno');
    const yesButton = page.getByRole('button', { name: /yes/i });
    await expect(yesButton).toHaveAttribute('data-selected', 'true');
  });

  test('自动勾选推荐选项 - 评分题', async ({ page, allQuestionTypesSession, questionsPage }) => {
    const { session } = allQuestionTypesSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 验证评分题推荐选项自动选中（推荐评分4）
    const ratingQuestion = questionsPage.getQuestion('q_rating');
    const rating4Button = page.getByRole('button', { name: /^4/ });
    await expect(rating4Button).toHaveAttribute('data-selected', 'true');
  });

  test('缓存优先级 - 使用缓存值而不是推荐选项', async ({ page, basicSession, questionsPage }) => {
    const { session } = basicSession;

    // 第一次访问，选择非推荐选项
    await page.goto(session.url);
    await questionsPage.waitForLoad();

    const singleQuestion = questionsPage.getQuestion('q_auth');
    await singleQuestion.selectOption('Session Cookies');
    await questionsPage.submit();
    await questionsPage.waitForSubmitSuccess();

    // 第二次访问（模拟缓存）
    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 验证使用缓存值而不是推荐选项
    await singleQuestion.expectOptionSelected('Session Cookies');
  });

  test('完整流程 - 轮次显示 + 选择"无"选项 + 提交', async ({ page, allQuestionTypesSession, questionsPage }) => {
    const { session } = allQuestionTypesSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 1. 验证轮次显示
    await questionsPage.expectRoundIndicator(1, 'All Question Types');

    // 2. 选择单选题的"无"选项
    await questionsPage.selectSingleNoneOption('q_single');

    // 3. 保持多选题的推荐选项（自动选中）
    // 4. 填写文本题
    await questionsPage.fillText('q_text', 'I chose none of the above for single choice');

    // 5. 填写额外备注
    await questionsPage.fillAdditionalNotes('Testing the none option feature');

    // 6. 提交
    await questionsPage.submit();

    // 7. 验证提交成功
    await questionsPage.waitForSubmitSuccess();
  });
});
