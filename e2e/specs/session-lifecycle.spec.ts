/**
 * 会话生命周期测试
 */

import { test, expect } from '../fixtures';
import { createRound, waitResponse, getSession, cancelSession, completeSession, generateGrilling } from '../utils/cli';

test.describe('会话生命周期', () => {
  test('完整流程：创建 → 答题 → 多轮 → 完成', async ({
    page,
    basicSession,
    questionsPage,
  }) => {
    const { session } = basicSession;

    // 1. 打开会话 URL
    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 2. 验证问题加载
    await expect(page.getByText('Auth Method')).toBeVisible();
    await expect(page.getByText('Which authentication method should we use?')).toBeVisible();

    // 3. 选择答案
    await page.getByText('JWT').click();

    // 4. 提交响应
    await questionsPage.submit();
    await questionsPage.waitForSubmitSuccess();

    // 5. 推送下一轮（通过 cli/）
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

    // 6. 验证自动加载下一轮（SSE 事件触发）
    await expect(page.getByText('Which database?')).toBeVisible({ timeout: 10000 });

    // 7. 完成第二轮
    await page.getByText('PostgreSQL').click();
    await questionsPage.submit();

    // 8. 验证后端状态
    const waitResult = await waitResponse(session.session_id, 2);
    expect(waitResult.round).toBe(2);
  });

  test('用户取消', async ({ page, cancellableSession, terminalPage }) => {
    const { session } = cancellableSession;

    // 打开会话
    await page.goto(session.url);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // 通过 API 取消会话
    await cancelSession(session.session_id, 'user_cancelled');

    // 验证取消页面
    await expect(page.getByRole("heading", { name: /cancelled/i })).toBeVisible({ timeout: 10000 });
  });

  test('会话完成', async ({ page, basicSession, terminalPage }) => {
    const { session } = basicSession;

    // 打开会话
    await page.goto(session.url);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // 通过 API 完成会话
    await completeSession(session.session_id);

    // 验证完成页面
    await expect(page.getByText(/completed/i)).toBeVisible({ timeout: 10000 });
  });

  test('查询会话状态', async ({ basicSession }) => {
    const { session } = basicSession;

    // 查询会话状态
    const sessionInfo = await getSession(session.session_id);

    // 验证返回值
    expect(sessionInfo.session_id).toBe(session.session_id);
    expect(sessionInfo.status).toBe('active');
    expect(sessionInfo.current_round).toBe(1);
  });

  test('多轮问答流程', async ({
    page,
    multiRoundSession,
    questionsPage,
  }) => {
    const { session, rounds } = multiRoundSession;

    // 打开会话
    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 回答第一轮
    await page.getByText('JWT').click();
    await questionsPage.submit();
    await questionsPage.waitForSubmitSuccess();

    // 推送第二轮
    await createRound(session.session_id, rounds[1].grillingJson, 'Round 2');

    // 验证第二轮加载
    await expect(page.getByText('Which database?')).toBeVisible({ timeout: 10000 });

    // 回答第二轮
    await page.getByText('PostgreSQL').click();
    await questionsPage.submit();

    // 验证后端状态
    const waitResult = await waitResponse(session.session_id, 2);
    expect(waitResult.round).toBe(2);
  });
});
