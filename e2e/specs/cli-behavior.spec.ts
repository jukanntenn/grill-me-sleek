/**
 * cli/ 命令行为测试
 */

import { test, expect } from '../fixtures';
import {
  createSession,
  createRound,
  waitResponse,
  expectWaitTimeout,
  expectWaitCancelled,
  getSession,
  expectSessionCompleted,
  expectSessionCancelled,
  completeSession,
  cancelSession,
  expectJsonParseError,
  expectSchemaValidationError,
  expectDuplicateIdError,
  runCli,
  generateGrilling,
} from '../utils/cli';

test.describe('cli/ 命令行为', () => {
  test.describe('create 命令', () => {
    test('成功创建会话', async () => {
      const grillingJson = generateGrilling({
        name: 'CLI Test Session',
        questions: [
          { id: 'q1', header: 'Q1', text: 'Test question', type: 'single', options: [{ label: 'A' }, { label: 'B' }], recommended: 0 },
        ],
      });

      const session = await createSession('CLI Test Session', grillingJson);
      expect(session.session_id).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(session.url).toContain('#');
      expect(session.status).toBe('active');
      expect(session.current_round).toBe(1);
    });

    test('无效 JSON 输入', async () => {
      await expectJsonParseError(['create', '--json'], '{ invalid json }');
    });

    test('Schema 验证失败', async () => {
      const invalidGrilling = JSON.stringify({ name: 'test' });
      await expectSchemaValidationError(['create', '--json'], invalidGrilling);
    });

    test('重复问题 ID', async () => {
      const grillingWithDuplicateIds = JSON.stringify({
        name: 'test',
        questions: [
          { id: 'q1', header: 'Q1', text: 'Text 1', type: 'text' },
          { id: 'q1', header: 'Q2', text: 'Text 2', type: 'text' },
        ],
      });
      await expectDuplicateIdError(['create', '--json'], grillingWithDuplicateIds);
    });
  });

  test.describe('push 命令', () => {
    test('成功推送新轮次', async () => {
      const grillingJson = generateGrilling({
        name: 'Round Test',
        questions: [{ id: 'q1', header: 'Q1', text: 'Test question', type: 'text' }],
      });

      const session = await createSession('Round Test', grillingJson);

      const round2Json = generateGrilling({
        name: 'Round 2',
        questions: [{ id: 'q2', header: 'Q2', text: 'Another question', type: 'text' }],
      });

      const round = await createRound(session.session_id, round2Json, 'Round 2');
      expect(round.round).toBe(2);
    });

    test('不存在的会话', async () => {
      const grillingJson = generateGrilling({
        name: 'test',
        questions: [{ id: 'q1', header: 'Q1', text: 'Text', type: 'text' }],
      });

      const result = await runCli(['push', 'nonexistent-session', '--json'], grillingJson);
      expect(result.code).toBe(1);
    });
  });

  test.describe('poll 命令', () => {
    test('超时', async () => {
      const grillingJson = generateGrilling({
        name: 'Timeout Test',
        questions: [{ id: 'q1', header: 'Q1', text: 'Test question', type: 'text' }],
      });

      const session = await createSession('Timeout Test', grillingJson);
      await expectWaitTimeout(session.session_id, 1, 2);
    });

    test('会话取消', async () => {
      const grillingJson = generateGrilling({
        name: 'Cancelled Wait Test',
        questions: [{ id: 'q1', header: 'Q1', text: 'Test question', type: 'text' }],
      });

      const session = await createSession('Cancelled Wait Test', grillingJson);
      await cancelSession(session.session_id, 'user_cancelled');
      await expectWaitCancelled(session.session_id, 1);
    });
  });

  test.describe('status 命令', () => {
    test('查询活跃会话', async () => {
      const grillingJson = generateGrilling({
        name: 'Session Query Test',
        questions: [{ id: 'q1', header: 'Q1', text: 'Test question', type: 'text' }],
      });

      const created = await createSession('Session Query Test', grillingJson);
      const session = await getSession(created.session_id);

      expect(session.session_id).toBe(created.session_id);
      expect(session.status).toBe('active');
      expect(session.current_round).toBe(1);
    });

    test('查询已完成会话', async () => {
      const grillingJson = generateGrilling({
        name: 'Completed Session Query',
        questions: [{ id: 'q1', header: 'Q1', text: 'Test question', type: 'text' }],
      });

      const session = await createSession('Completed Session Query', grillingJson);
      await completeSession(session.session_id);
      await expectSessionCompleted(session.session_id);
    });

    test('查询已取消会话', async () => {
      const grillingJson = generateGrilling({
        name: 'Cancelled Session Query',
        questions: [{ id: 'q1', header: 'Q1', text: 'Test question', type: 'text' }],
      });

      const session = await createSession('Cancelled Session Query', grillingJson);
      await cancelSession(session.session_id, 'user_cancelled');
      // API 终端状态响应不包含 reason 字段
      await expectSessionCancelled(session.session_id);
    });

    test('查询不存在的会话', async () => {
      const result = await runCli(['status', 'nonexistent-session', '--json']);
      expect(result.code).toBe(1);
    });
  });

  test.describe('complete 命令', () => {
    test('成功完成会话', async () => {
      const grillingJson = generateGrilling({
        name: 'Complete Test',
        questions: [{ id: 'q1', header: 'Q1', text: 'Test question', type: 'text' }],
      });

      const session = await createSession('Complete Test', grillingJson);
      await completeSession(session.session_id);
      await expectSessionCompleted(session.session_id);
    });
  });

  test.describe('cancel 命令', () => {
    test('成功取消会话', async () => {
      const grillingJson = generateGrilling({
        name: 'Cancel Test',
        questions: [{ id: 'q1', header: 'Q1', text: 'Test question', type: 'text' }],
      });

      const session = await createSession('Cancel Test', grillingJson);
      await cancelSession(session.session_id, 'user_cancelled');
      // API 终端状态响应不包含 reason 字段
      await expectSessionCancelled(session.session_id);
    });

    test('无效的取消原因', async () => {
      const grillingJson = generateGrilling({
        name: 'Invalid Cancel Reason Test',
        questions: [{ id: 'q1', header: 'Q1', text: 'Test question', type: 'text' }],
      });

      const session = await createSession('Invalid Cancel Reason Test', grillingJson);
      const result = await runCli(['cancel', session.session_id, '--reason', 'invalid_reason']);
      expect(result.code).toBe(64);
      expect(result.stderr).toContain('invalid --reason');
    });
  });
});
