/**
 * cli/ 命令封装
 */

import { spawn } from 'node:child_process';
import { expect } from '@playwright/test';

const CLI_PATH = process.env.CLI_PATH ?? '../cli/dist/grill.js';
const GS_SERVER = process.env.GS_SERVER ?? 'http://localhost:8080';

const CLI_ENV = {
  ...process.env,
  GS_SERVER,
  GS_HTTP_TIMEOUT: '30',
  GS_LONGPOLL_HTTP_TIMEOUT: '65',
};

export interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface CreateSessionResult {
  session_id: string;
  url: string;
  status: string;
  current_round: number;
  name?: string;
  created_at: string;
  expires_at: string;
}

export interface RoundResult {
  round: number;
  name?: string;
  grilling: unknown;
}

export interface WaitResult {
  round: number;
  answers: Record<string, { selected: string | string[]; custom_text?: string }>;
  additional_notes?: string;
  submitted_at: string;
}

export interface SessionResult {
  session_id: string;
  status: string;
  current_round: number;
  name?: string;
  created_at: string;
  expires_at: string;
}

export interface RoundSummary {
  round: number;
  name?: string;
  has_response: boolean;
}

export interface GenerateGrillingOptions {
  name?: string;
  questions?: Array<{
    id: string;
    header: string;
    text: string;
    type: 'single' | 'multi' | 'text';
    options?: Array<{ label: string; description?: string }>;
    recommended?: number;
    variant?: 'default' | 'yesno' | 'rating';
    rating_max?: number;
    required?: boolean;
    allow_custom_text?: boolean;
    max_length?: number;
    placeholder?: string;
    explanation?: string;
  }>;
  additional_notes?: {
    label?: string;
    placeholder?: string;
    max_length?: number;
    required?: boolean;
  };
}

/**
 * 执行 cli/ 命令
 */
export async function runCli(args: string[], input?: string): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI_PATH, ...args], {
      env: CLI_ENV,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    }

    child.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 0 });
    });

    child.on('error', (err) => {
      resolve({ stdout, stderr: err.message, code: 1 });
    });

    setTimeout(() => {
      child.kill();
      resolve({ stdout, stderr: stderr + '\nProcess timed out', code: 1 });
    }, 120_000);
  });
}

/**
 * 执行 cli/ 命令，成功时返回 stdout
 */
export async function runCliOrFail(args: string[], input?: string): Promise<string> {
  const result = await runCli(args, input);
  if (result.code !== 0) {
    throw new Error(`CLI failed with code ${result.code}: ${result.stderr}`);
  }
  return result.stdout;
}

/**
 * 断言 cli/ 命令执行成功
 */
export async function expectCliSuccess<T = any>(
  args: string[],
  input?: string
): Promise<{ result: CliResult; data: T }> {
  const result = await runCli(args, input);
  
  expect(result.code).toBe(0);
  // Ignore all warnings and info messages in stderr
  const realErrors = result.stderr.split('\n').filter(
    line => line && 
            !line.includes('Warning:') && 
            !line.includes('warning:') &&
            !line.includes('Use `node --trace-warnings') &&
            !line.includes('info:')
  ).join('\n');
  if (realErrors.trim()) {
    expect(realErrors).toBe('');
  }
  
  let data: T;
  try {
    data = JSON.parse(result.stdout);
  } catch {
    throw new Error(`Failed to parse CLI output as JSON:\n${result.stdout}`);
  }
  
  return { result, data };
}

/**
 * 生成 Grilling JSON
 */
export function generateGrilling(options: GenerateGrillingOptions): string {
  const grilling = {
    name: options.name ?? `test-${Date.now()}`,
    questions: options.questions ?? [
      {
        id: 'q_test',
        header: 'Test',
        text: 'This is a test question',
        type: 'single',
        options: [{ label: 'Option A' }, { label: 'Option B' }],
        recommended: 0,
      },
    ],
  };
  return JSON.stringify(grilling, null, 2);
}

/**
 * 创建会话
 */
export async function createSession(
  name: string,
  grillingJson: string
): Promise<CreateSessionResult> {
  const { data } = await expectCliSuccess<CreateSessionResult>(
    ['create', '--json=session_id,url,status,current_round,name,created_at,expires_at'],
    grillingJson
  );
  expect(data.session_id).toBeTruthy();
  expect(data.url).toBeTruthy();
  expect(data.status).toBe('active');
  return data;
}

/**
 * 推送新轮次
 */
export async function createRound(
  sessionId: string,
  grillingJson: string,
  roundName?: string
): Promise<RoundResult> {
  const { data } = await expectCliSuccess<RoundResult>(
    ['push', sessionId, '--json=round,name,grilling'],
    grillingJson
  );
  expect(data.round).toBeGreaterThan(0);
  return data;
}

/**
 * 等待用户响应
 */
export async function waitResponse(
  sessionId: string,
  round: number,
  waitSeconds: number = 60
): Promise<WaitResult> {
  const result = await runCli(['poll', sessionId, '--wait', String(waitSeconds)]);
  expect(result.code).toBe(0);
  const data = JSON.parse(result.stdout);
  expect(data.round).toBe(round);
  return data;
}

/**
 * 等待超时
 */
export async function expectWaitTimeout(
  sessionId: string,
  round: number,
  waitSeconds: number = 5
): Promise<void> {
  const result = await runCli(['poll', sessionId, '--wait', String(waitSeconds)]);
  expect(result.code).toBe(75);
  const data = JSON.parse(result.stdout);
  expect(data.status).toBe('timeout');
}

/**
 * 等待会话取消
 */
export async function expectWaitCancelled(
  sessionId: string,
  round: number
): Promise<void> {
  const result = await runCli(['poll', sessionId]);
  // poll 命令在会话取消时返回退出码 1（因为获取会话信息失败）
  expect(result.code).toBe(1);
  expect(result.stderr).toContain('410 Gone');
}

/**
 * 查询会话状态
 */
export async function getSession(sessionId: string): Promise<SessionResult> {
  const { data } = await expectCliSuccess<SessionResult>(
    ['status', sessionId, '--json=session_id,status,current_round,name,created_at,expires_at']
  );
  expect(data.session_id).toBe(sessionId);
  return data;
}

/**
 * 期望会话已完成
 */
export async function expectSessionCompleted(sessionId: string): Promise<void> {
  const result = await runCli(['status', sessionId, '--json=status,detail']);
  expect(result.code).toBe(0);
  const data = JSON.parse(result.stdout);
  expect(data.status).toBe('gone');
  expect(data.detail).toBe('completed');
}

/**
 * 期望会话已取消
 */
export async function expectSessionCancelled(sessionId: string, reason?: string): Promise<void> {
  const result = await runCli(['status', sessionId, '--json=status,detail,reason']);
  expect(result.code).toBe(0);
  const data = JSON.parse(result.stdout);
  expect(data.status).toBe('gone');
  expect(data.detail).toBe('cancelled');
}

/**
 * 完成会话
 */
export async function completeSession(sessionId: string): Promise<void> {
  const result = await runCli(['complete', sessionId]);
  expect(result.code).toBe(0);
}

/**
 * 取消会话
 */
export async function cancelSession(sessionId: string, reason: string): Promise<void> {
  const result = await runCli(['cancel', sessionId, '--reason', reason]);
  expect(result.code).toBe(0);
}

/**
 * 断言无效输入
 */
export async function expectInvalidInput(args: string[], input?: string): Promise<void> {
  const result = await runCli(args, input);
  expect(result.code).toBe(64);
}

/**
 * 断言 JSON 解析错误
 */
export async function expectJsonParseError(args: string[], invalidJson: string): Promise<void> {
  const result = await runCli(args, invalidJson);
  expect(result.code).toBe(64);
  expect(result.stderr).toMatch(/json (repair failed|parse error)/);
}

/**
 * 断言 Schema 验证错误
 */
export async function expectSchemaValidationError(args: string[], invalidGrilling: string): Promise<void> {
  const result = await runCli(args, invalidGrilling);
  expect(result.code).toBe(64);
  expect(result.stderr).toContain('schema validation failed');
}

/**
 * 断言重复 ID 错误
 */
export async function expectDuplicateIdError(args: string[], grillingWithDuplicateIds: string): Promise<void> {
  const result = await runCli(args, grillingWithDuplicateIds);
  expect(result.code).toBe(64);
  expect(result.stderr).toContain('duplicate question id');
}

/**
 * 期望会话过期
 */
export async function expectSessionExpired(sessionId: string): Promise<void> {
  const result = await runCli(['status', sessionId, '--json=status,detail']);
  expect(result.code).toBe(0);
  const data = JSON.parse(result.stdout);
  expect(data.status).toBe('gone');
  expect(data.detail).toBe('expired');
}

/**
 * 期望等待过期
 */
export async function expectWaitExpired(sessionId: string, round: number): Promise<void> {
  const result = await runCli(['poll', sessionId]);
  expect(result.code).toBe(76);
  const data = JSON.parse(result.stdout);
  expect(data.status).toBe('expired');
}

/**
 * 模拟会话过期
 */
export async function simulateSessionExpired(sessionId: string): Promise<void> {
  const { simulateSessionExpired: simulateExpired } = await import("./db");
  simulateExpired(sessionId);
}

/**
 * 列出轮次
 */
export async function listRounds(sessionId: string): Promise<RoundSummary[]> {
  const session = await getSession(sessionId);
  return [{ round: session.current_round, has_response: false }];
}
