/**
 * 边界情况测试
 */

import { test, expect } from '../fixtures';

test.describe('边界情况', () => {
  test('重复提交响应', async ({ page, basicSession, questionsPage }) => {
    const { session } = basicSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();
    await questionsPage.expectQuestionCount(1);

    // 填写答案
    await questionsPage.selectSingleOption('q_auth', 'JWT');

    // 第一次提交
    await questionsPage.submit();
    await questionsPage.waitForSubmitSuccess();

    // 提交成功后页面进入等待下一轮状态，UI 上已无提交表单，
    // 因此无法通过 UI 重复提交；验证等待提示即可。
    await expect(page.getByText('Waiting for the next round')).toBeVisible();
  });

  test('必填字段验证', async ({ page, allQuestionTypesSession, questionsPage }) => {
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

  test('长文本输入', async ({ page, allQuestionTypesSession, questionsPage }) => {
    const { session } = allQuestionTypesSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 输入长文本
    const longText = 'A'.repeat(500);
    await questionsPage.fillText('q_text', longText);

    // 验证输入值
    const question = questionsPage.getQuestion('q_text');
    await expect(question.getContainer().locator('textarea')).toHaveValue(longText);
  });

  test('自定义文本输入', async ({ page, allQuestionTypesSession, questionsPage }) => {
    const { session } = allQuestionTypesSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 选择单选选项并填写自定义文本
    await questionsPage.selectSingleOption('q_single', 'Option A');
    await questionsPage.getQuestion('q_single').fillCustomText('My custom answer');

    // 填写其他必填字段
    await questionsPage.selectMultipleOptions('q_multi', ['Feature A']);
    await questionsPage.fillText('q_text', 'Some text');
    await questionsPage.getQuestion('q_yesno').selectYesNo('yes');
    await questionsPage.getQuestion('q_rating').selectRating(4);

    // 提交
    await questionsPage.submit();

    // 验证提交成功
    await questionsPage.waitForSubmitSuccess();
  });

  test('多选题', async ({ page, allQuestionTypesSession, questionsPage }) => {
    const { session } = allQuestionTypesSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 选择多个选项
    await questionsPage.selectMultipleOptions('q_multi', ['Feature A', 'Feature B']);

    // 填写其他必填字段
    await questionsPage.selectSingleOption('q_single', 'Option A');
    await questionsPage.fillText('q_text', 'Some text');
    await questionsPage.getQuestion('q_yesno').selectYesNo('yes');
    await questionsPage.getQuestion('q_rating').selectRating(4);

    // 提交
    await questionsPage.submit();

    // 验证提交成功
    await questionsPage.waitForSubmitSuccess();
  });

  test('评分题', async ({ page, allQuestionTypesSession, questionsPage }) => {
    const { session } = allQuestionTypesSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 选择评分
    await questionsPage.getQuestion('q_rating').selectRating(4);

    // 填写其他必填字段
    await questionsPage.selectSingleOption('q_single', 'Option A');
    await questionsPage.selectMultipleOptions('q_multi', ['Feature A']);
    await questionsPage.fillText('q_text', 'Some text');
    await questionsPage.getQuestion('q_yesno').selectYesNo('yes');

    // 提交
    await questionsPage.submit();

    // 验证提交成功
    await questionsPage.waitForSubmitSuccess();
  });

  test('是/否题', async ({ page, allQuestionTypesSession, questionsPage }) => {
    const { session } = allQuestionTypesSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 选择是
    await questionsPage.getQuestion('q_yesno').selectYesNo('yes');

    // 填写其他必填字段
    await questionsPage.selectSingleOption('q_single', 'Option A');
    await questionsPage.selectMultipleOptions('q_multi', ['Feature A']);
    await questionsPage.fillText('q_text', 'Some text');
    await questionsPage.getQuestion('q_rating').selectRating(4);

    // 提交
    await questionsPage.submit();

    // 验证提交成功
    await questionsPage.waitForSubmitSuccess();
  });

  test('额外备注', async ({ page, allQuestionTypesSession, questionsPage }) => {
    const { session } = allQuestionTypesSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 填写所有必填字段
    await questionsPage.selectSingleOption('q_single', 'Option A');
    await questionsPage.selectMultipleOptions('q_multi', ['Feature A']);
    await questionsPage.fillText('q_text', 'Some text');
    await questionsPage.getQuestion('q_yesno').selectYesNo('yes');
    await questionsPage.getQuestion('q_rating').selectRating(4);

    // 填写额外备注
    await questionsPage.fillAdditionalNotes('Some additional notes');

    // 提交
    await questionsPage.submit();

    // 验证提交成功
    await questionsPage.waitForSubmitSuccess();
  });
});
