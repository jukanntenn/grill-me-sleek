/**
 * 多轮问答测试
 */

import { test, expect } from '../fixtures';
import { createRound, listRounds, generateGrilling } from '../utils/cli';

test.describe('多轮问答', () => {
  test('轮次顺序和历史', async ({ page, multiRoundSession, questionsPage }) => {
    const { session, rounds } = multiRoundSession;

    // 打开会话
    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 回答第一轮
    await questionsPage.selectSingleOption('q_auth', 'JWT');
    await questionsPage.submit();
    await questionsPage.waitForSubmitSuccess();

    // 推送第二轮
    await createRound(session.session_id, rounds[1].grillingJson, 'Round 2');

    // 验证第二轮加载
    await questionsPage.expectQuestionText('Which database?');

    // 回答第二轮
    await questionsPage.selectSingleOption('q_db', 'PostgreSQL');
    await questionsPage.submit();

    // 验证轮次列表
    const roundList = await listRounds(session.session_id);
    expect(roundList).toHaveLength(2);
    expect(roundList[0].has_response).toBe(true);
    expect(roundList[1].has_response).toBe(true);
  });

  test('轮次切换确认', async ({ page, multiRoundSession, questionsPage }) => {
    const { session, rounds } = multiRoundSession;

    // 打开会话
    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 回答第一轮
    await questionsPage.selectSingleOption('q_auth', 'JWT');
    await questionsPage.submit();
    await questionsPage.waitForSubmitSuccess();

    // 推送第二轮（触发确认对话框）
    await createRound(session.session_id, rounds[1].grillingJson, 'Round 2');

    // 验证确认对话框
    await expect(page.getByText(/switch to round 2/i)).toBeVisible();

    // 确认切换
    await page.getByRole('button', { name: /ok/i }).click();

    // 验证第二轮加载
    await questionsPage.expectQuestionText('Which database?');
  });

  test('多轮次列表', async ({ page, multiRoundSession, questionsPage }) => {
    const { session, rounds } = multiRoundSession;

    // 打开会话
    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 回答第一轮
    await questionsPage.selectSingleOption('q_auth', 'JWT');
    await questionsPage.submit();
    await questionsPage.waitForSubmitSuccess();

    // 推送第二轮
    await createRound(session.session_id, rounds[1].grillingJson, 'Round 2');

    // 确认切换
    await page.getByRole('button', { name: /ok/i }).click();
    await questionsPage.waitForLoad();

    // 回答第二轮
    await questionsPage.selectSingleOption('q_db', 'PostgreSQL');
    await questionsPage.submit();
    await questionsPage.waitForSubmitSuccess();

    // 推送第三轮
    const round3Json = generateGrilling({
      name: 'Round 3',
      questions: [
        {
          id: 'q_cache',
          header: 'Cache',
          text: 'Which cache strategy?',
          type: 'single',
          options: [
            { label: 'Redis' },
            { label: 'Memcached' },
          ],
          recommended: 0,
        },
      ],
    });
    await createRound(session.session_id, round3Json, 'Round 3');

    // 确认切换
    await page.getByRole('button', { name: /ok/i }).click();
    await questionsPage.waitForLoad();

    // 验证轮次列表
    const roundList = await listRounds(session.session_id);
    expect(roundList).toHaveLength(3);
    expect(roundList[0].has_response).toBe(true);
    expect(roundList[1].has_response).toBe(true);
    expect(roundList[2].has_response).toBe(false);
  });
});
