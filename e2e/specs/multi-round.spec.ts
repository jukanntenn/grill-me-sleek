/**
 * 多轮问答测试
 */

import { test, expect } from '../fixtures';
import { createRound, listRounds, generateGrilling } from '../utils/cli';

test.describe('多轮问答', () => {
  test('轮次顺序和历史', async ({ page, multiRoundSession, questionsPage }) => {
    // 新轮次推送自动跟随（无模态确认）；dialog 兜底接受以防意外弹窗
    page.on('dialog', (dialog) => dialog.accept());

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

  test('轮次自动跟随（新轮推送无模态确认）', async ({ page, multiRoundSession, questionsPage }) => {
    let dialogSeen = false;
    page.on('dialog', (dialog) => {
      dialogSeen = true;
      dialog.accept();
    });

    const { session, rounds } = multiRoundSession;

    // 打开会话（此时用户正在填写第一轮，处于 RENDER_QUESTIONS）
    await page.goto(session.url);
    await questionsPage.waitForLoad();

    // 在未提交第一轮的情况下推送第二轮：页面自行切到第二轮，不弹模态确认
    await createRound(session.session_id, rounds[1].grillingJson, 'Round 2');

    await questionsPage.expectQuestionText('Which database?');
    expect(dialogSeen).toBe(false);
  });

  test('多轮次列表', async ({ page, multiRoundSession, questionsPage }) => {
    // 新轮次推送自动跟随（无模态确认）；dialog 兜底接受以防意外弹窗
    page.on('dialog', (dialog) => dialog.accept());

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

    // 等待切换后回答第二轮
    await questionsPage.expectQuestionText('Which database?');
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

    // 等待切换到第三轮
    await questionsPage.expectQuestionText('Which cache strategy?');

    // 验证轮次列表
    const roundList = await listRounds(session.session_id);
    expect(roundList).toHaveLength(3);
    expect(roundList[0].has_response).toBe(true);
    expect(roundList[1].has_response).toBe(true);
    expect(roundList[2].has_response).toBe(false);
  });
});
