/**
 * 修订（PUT response）端到端测试：
 *   - UI 全流程：stepper 查看历史 → 修改回答 → 通知 + 自动返回当前轮
 *   - API 契约：revision 计数、轮次摘要、agent 重新拉取
 *   - CLI 长轮询在等待期间感知其他轮的修订（stderr 警告）
 *   - markdown 背景渲染、tab 标题
 */

import { test, expect } from '../fixtures';
import {
  createSession,
  createRound,
  generateGrilling,
  listRounds,
  reviseResponse,
  runCli,
  waitResponse,
} from '../utils/cli';

test.describe('回答修订', () => {
  test('UI 全流程：查看历史轮 → 修改回答 → 自动返回当前轮', async ({
    page,
    multiRoundSession,
    questionsPage,
  }) => {
    page.on('dialog', (dialog) => dialog.accept());
    const { session, rounds } = multiRoundSession;

    // 打开会话，回答第一轮
    await page.goto(session.url);
    await questionsPage.waitForLoad();
    await questionsPage.selectSingleOption('q_auth', 'JWT');
    await questionsPage.submit();
    await questionsPage.waitForSubmitSuccess();

    // 推送第二轮并等待加载
    await createRound(session.session_id, rounds[1].grillingJson, 'Round 2');
    await questionsPage.expectQuestionText('Which database?');

    // 轮次导航出现，第一轮已答可点
    await expect(questionsPage.roundStepper).toBeVisible();
    await questionsPage.selectStepperRound(1);

    // 历史只读视图：显示原回答
    const review = page.getByTestId('review-round-1');
    await expect(review).toBeVisible();
    await expect(page.getByTestId('review-question-q_auth')).toContainText('JWT');

    // 进入修订模式：预填原回答
    await questionsPage.startRevise();
    await expect(page.getByTestId('revise-submit')).toBeVisible();
    await questionsPage.getQuestion('q_auth').expectOptionSelected('JWT');

    // 改选另一个选项并更新
    await questionsPage.selectSingleOption('q_auth', 'Session Cookies');
    await questionsPage.submitRevision();

    // 修订成功通知 + 自动返回当前轮（第二轮表单）
    await expect(page.getByTestId('notice')).toBeVisible();
    await questionsPage.expectQuestionText('Which database?');

    // 服务端状态：revision=2，答案已更新
    const summary = await listRounds(session.session_id);
    expect(summary[0].revision).toBe(2);
    expect(summary[1].revision).toBe(1);
    const response = await waitResponse(session.session_id, 1, 5);
    expect(response.answers.q_auth.selected).toBe('Session Cookies');
    expect(response.revision).toBe(2);
  });

  test('API：未回答的轮不可修订（409）', async ({ basicSession }) => {
    const { session } = basicSession;
    await expect(
      reviseResponse(session.session_id, 1, { q_auth: { selected: 'JWT' } })
    ).rejects.toThrow(/409/);
  });

  test('CLI 长轮询在等待期间感知其他轮的修订', async ({
    page,
    multiRoundSession,
    questionsPage,
  }) => {
    page.on('dialog', (dialog) => dialog.accept());
    const { session, rounds } = multiRoundSession;

    // 建立两轮局面：第一轮已答，第二轮等待中
    await page.goto(session.url);
    await questionsPage.waitForLoad();
    await questionsPage.selectSingleOption('q_auth', 'JWT');
    await questionsPage.submit();
    await questionsPage.waitForSubmitSuccess();
    await createRound(session.session_id, rounds[1].grillingJson, 'Round 2');
    await questionsPage.expectQuestionText('Which database?');

    // 启动 CLI 长轮询（等待第二轮，15 秒超时）——修订应在等待期间发生
    const pollPromise = runCli([
      'poll',
      session.session_id,
      '--round',
      '2',
      '--wait',
      '15',
      '--json',
    ]);

    // 等待 CLI 进入等待状态后修订第一轮（API 路径）
    await page.waitForTimeout(2000);
    await reviseResponse(session.session_id, 1, { q_auth: { selected: 'Session Cookies' } });

    const poll = await pollPromise;
    // 第二轮始终未答 → 超时退出，但 stderr 必须包含修订警告
    expect(poll.code).toBe(75);
    expect(poll.stderr).toContain('round 1 answer was revised');
    expect(poll.stderr).toContain('revision 2');
  });

  test('markdown 背景渲染为富文本', async ({ page }) => {
    const grillingJson = generateGrilling({
      name: 'Markdown Session',
      description:
        '## 背景\n\n当前使用 `sqlx` **offline** 模式。\n\n| 方案 | 成本 |\n|---|---|\n| 逐表 | 低 |\n| 重写 | 高 |\n\n> 注意：停机窗口 ≤ 30min',
      questions: [
        {
          id: 'q_md',
          header: 'Choice',
          text: '选一个 **方案**（支持 `markdown`）',
          type: 'single',
          options: [{ label: '逐表' }, { label: '重写' }],
          recommended: 0,
        },
      ],
    });
    const session = await createSession('Markdown Session', grillingJson);

    await page.goto(session.url);
    await page.getByTestId('question-q_md').waitFor({ timeout: 10000 });

    // 表格、行内代码、引用被渲染为对应元素而非纯文本
    await expect(page.locator('.markdown-body table')).toBeVisible();
    await expect(page.locator('.markdown-body table').getByText('逐表')).toBeVisible();
    await expect(page.locator('.markdown-body blockquote')).toContainText('停机窗口');
    await expect(page.locator('.markdown-body code').first()).toHaveText('sqlx');
  });

  test('tab 标题显示会话名', async ({ page, basicSession }) => {
    const { session } = basicSession;
    await page.goto(session.url);
    await page.getByTestId('question-q_auth').waitFor({ timeout: 10000 });
    await expect(page).toHaveTitle('Basic Test Session — grill-me-sleek');
  });
});
