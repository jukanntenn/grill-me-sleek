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
});
