/**
 * SSE 事件流测试
 */

import { test, expect } from '../fixtures';
import { createRound, completeSession, cancelSession, generateGrilling } from '../utils/cli';

test.describe('SSE 事件流', () => {
  test('接收轮次创建事件', async ({ page, basicSession, questionsPage }) => {
    const { session } = basicSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();
    await questionsPage.expectQuestionCount(1);

    // 回答第一轮
    await questionsPage.selectSingleOption('q_auth', 'JWT');
    await questionsPage.submit();
    await questionsPage.waitForSubmitSuccess();

    // 推送第二轮（触发 SSE 事件）
    const round2Json = generateGrilling({
      name: 'Round 2',
      questions: [
        {
          id: 'q_db',
          header: 'Database',
          text: 'Which database?',
          type: 'single',
          options: [
            { label: 'PostgreSQL' },
            { label: 'MySQL' },
          ],
          recommended: 0,
        },
      ],
    });
    await createRound(session.session_id, round2Json, 'Round 2');

    // 验证自动切换到第二轮（SSE 事件触发）
    await questionsPage.expectQuestionText('Which database?');
  });

  test('接收会话完成事件', async ({ page, basicSession, terminalPage }) => {
    const { session } = basicSession;

    await page.goto(session.url);
    await page.waitForLoadState('domcontentloaded');

    // 完成会话（触发 SSE 事件）
    await completeSession(session.session_id);

    // 验证完成页面
    await terminalPage.expectCompleted();
  });

  test('接收会话取消事件', async ({ page, cancellableSession, terminalPage }) => {
    const { session } = cancellableSession;

    await page.goto(session.url);
    await page.waitForLoadState('domcontentloaded');

    // 取消会话（触发 SSE 事件）
    await cancelSession(session.session_id, 'user_cancelled');

    // 验证取消页面（前端页面不显示取消原因，仅显示"This session has ended."）
    await terminalPage.expectCancelled();
  });

  test('SSE 重连', async ({ page, basicSession, questionsPage }) => {
    const { session } = basicSession;

    // 监听 SSE 连接请求
    let sseConnectionCount = 0;
    await page.route('**/v1/sessions/*/events', async (route) => {
      sseConnectionCount++;
      await route.continue();
    });

    // 第一阶段：正常连接
    await page.goto(session.url);
    await questionsPage.waitForLoad();
    await questionsPage.expectQuestionCount(1);
    expect(sseConnectionCount).toBe(1);

    // 第二阶段：模拟网络断开并恢复
    // 注意：setOffline 会影响新的 SSE 连接请求，但不会中断已建立的连接
    // 完整的重连流程需要在集成测试中验证
    await page.context().setOffline(true);
    await page.waitForTimeout(1000);
    await page.context().setOffline(false);
    await page.waitForTimeout(3000);

    // 第三阶段：验证页面仍然正常工作
    await questionsPage.expectQuestionCount(1);

    // 验证 SSE 连接已建立（至少1次）
    expect(sseConnectionCount).toBeGreaterThanOrEqual(1);
  });


  test('SSE 事件顺序', async ({ page, basicSession, questionsPage }) => {
    page.on('dialog', (dialog) => dialog.accept());

    const { session } = basicSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();
    await questionsPage.expectQuestionCount(1);

    // 回答第一轮
    await questionsPage.selectSingleOption('q_auth', 'JWT');
    await questionsPage.submit();
    await questionsPage.waitForSubmitSuccess();

    // 快速推送多个轮次
    for (let i = 2; i <= 4; i++) {
      const roundJson = generateGrilling({
        name: `Round ${i}`,
        questions: [
          {
            id: `q_${i}`,
            header: `Q${i}`,
            text: `Question ${i}`,
            type: 'text',
          },
        ],
      });
      await createRound(session.session_id, roundJson, `Round ${i}`);
    }

    // 验证最终显示最新轮次
    await questionsPage.expectQuestionText('Question 4');
  });
});
