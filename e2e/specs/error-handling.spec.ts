/**
 * 错误处理测试
 */

import { test, expect } from '../fixtures';

test.describe('错误处理', () => {
  test('网络错误重连', async ({ page, basicSession, questionsPage }) => {
    const { session } = basicSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();
    await questionsPage.expectQuestionCount(1);

    // 模拟网络断开
    await page.route('**/v1/**', route => route.abort());

    // 尝试提交（应该失败）
    await questionsPage.selectSingleOption('q_auth', 'JWT');
    await questionsPage.submit();

    // 验证错误提示
    await questionsPage.waitForError();

    // 恢复网络
    await page.unroute('**/v1/**');

    // 重试提交
    await questionsPage.retry();

    // 验证提交成功
    await questionsPage.waitForSubmitSuccess();
  });

  test('服务器错误处理', async ({ page, basicSession, questionsPage }) => {
    const { session } = basicSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();
    await questionsPage.expectQuestionCount(1);

    // 模拟服务器错误
    await page.route('**/v1/sessions/*/rounds/*/response', route =>
      route.fulfill({ status: 500, body: 'Internal Server Error' })
    );

    // 尝试提交
    await questionsPage.selectSingleOption('q_auth', 'JWT');
    await questionsPage.submit();

    // 验证错误提示
    await questionsPage.waitForError();

    // 恢复正常
    await page.unroute('**/v1/sessions/*/rounds/*/response');

    // 重试提交
    await questionsPage.retry();

    // 验证提交成功
    await questionsPage.waitForSubmitSuccess();
  });

  test('无效会话 ID', async ({ page, terminalPage }) => {
    // 访问无效会话
    await page.goto('http://localhost:8443/#invalid-session-id');

    // 验证错误页面（后端将其视为不存在，显示 not found）
    await terminalPage.expectNotFound();
  });

  test('不存在的会话', async ({ page, terminalPage }) => {
    // 访问不存在的会话
    await page.goto('http://localhost:8443/#nonexistent-session-id-12345');

    // 验证错误页面（后端返回 404，前端显示 not found）
    await terminalPage.expectNotFound();
  });

  test('会话过期', async ({ page, basicSession, terminalPage }) => {
    const { session } = basicSession;

    // 打开会话
    await page.goto(session.url);
    await page.waitForLoadState('domcontentloaded');

    // 模拟会话过期
    // 注意：这需要实现 simulateSessionExpired 函数
    // await simulateSessionExpired(session.session_id);

    // 验证过期页面
    // await terminalPage.expectExpired();
  });
});
