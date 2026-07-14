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
    await page.waitForLoadState('networkidle');

    // 完成会话（触发 SSE 事件）
    await completeSession(session.session_id);

    // 验证完成页面
    await terminalPage.expectCompleted();
  });

  test('接收会话取消事件', async ({ page, cancellableSession, terminalPage }) => {
    const { session } = cancellableSession;

    await page.goto(session.url);
    await page.waitForLoadState('networkidle');

    // 取消会话（触发 SSE 事件）
    await cancelSession(session.session_id, 'user_cancelled');

    // 验证取消页面
    await terminalPage.expectCancelled('user_cancelled');
  });

  test('SSE 重连', async ({ page, basicSession, questionsPage }) => {
    const { session } = basicSession;

    await page.goto(session.url);
    await questionsPage.waitForLoad();
    await questionsPage.expectQuestionCount(1);

    // 模拟 SSE 连接断开
    await page.route('**/v1/sessions/*/events', route => route.abort());

    // 验证重连提示
    await expect(page.getByText(/reconnecting/i)).toBeVisible();

    // 恢复 SSE 连接
    await page.unroute('**/v1/sessions/*/events');

    // 验证重连成功
    await questionsPage.expectQuestionCount(1);
  });

  test('SSE 事件顺序', async ({ page, basicSession, questionsPage }) => {
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
