/**
 * cli/ 命令封装
 */

import { spawn } from 'node:child_process';
import { expect } from '@playwright/test';

const CLI_PATH = process.env.CLI_PATH ?? '../cli/dist/grilling-sleek.js';
const GRILLING_SLEEK_SERVER = process.env.GRILLING_SLEEK_SERVER ?? 'https://localhost:8443';

const CLI_ENV = {
  ...process.env,
  GRILLING_SLEEK_SERVER,
  GRILLING_SLEEK_HTTP_TIMEOUT: '30',
  GRILLING_SLEEK_LONGPOLL_HTTP_TIMEOUT: '65',
  NODE_TLS_REJECT_UNAUTHORIZED: '0',
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
  // Ignore all warnings, info messages, and pino-pretty multi-line output in stderr
  const realErrors = result.stderr.split('\n').filter(
    line => line &&
            !line.includes('Warning:') &&
            !line.includes('warning:') &&
            !line.includes('Use `node --trace-warnings') &&
            !line.includes('info:') &&
            !line.includes('INFO') &&
            !line.includes('ERROR') &&
            !line.includes('WARN') &&
            !line.match(/^\s+/)  // Filter out pino-pretty continuation lines (indented)
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
  const grilling: Record<string, unknown> = {
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
  if (options.additional_notes) {
    grilling.additional_notes = options.additional_notes;
  }
  return JSON.stringify(grilling, null, 2);
}

/**
 * 创建会话（使用 CLI）
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
 * 推送新轮次（使用 CLI）
 */
export async function createRound(
  sessionId: string,
  grillingJson: string,
  roundName?: string
): Promise<RoundResult> {
  const args = ['push', sessionId, '--json=round,name,grilling', '--inline', grillingJson];
  const { data } = await expectCliSuccess<RoundResult>(args);
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
  const { data } = await expectCliSuccess<WaitResult>(
    ['poll', sessionId, '--round', String(round), '--wait', String(waitSeconds), '--json']
  );
  return data;
}

/**
 * 断言等待超时
 */
export async function expectWaitTimeout(
  sessionId: string,
  round: number,
  waitSeconds: number = 5
): Promise<void> {
  const result = await runCli([
    'poll', sessionId, '--round', String(round), '--wait', String(waitSeconds), '--json'
  ]);
  expect(result.code).toBe(75); // timeout exit code
}

/**
 * 断言等待被取消
 */
export async function expectWaitCancelled(
  sessionId: string,
  round: number,
  waitSeconds: number = 60
): Promise<void> {
  const result = await runCli([
    'poll', sessionId, '--round', String(round), '--wait', String(waitSeconds), '--json'
  ]);
  expect(result.code).toBe(0);
  const data = JSON.parse(result.stdout);
  expect(data.status).toBe('cancelled');
}

/**
 * 获取会话状态（使用 CLI）
 */
export async function getSession(sessionId: string): Promise<SessionResult> {
  const { data } = await expectCliSuccess<SessionResult>(
    ['status', sessionId, '--json=session_id,status,current_round,name,created_at,expires_at']
  );
  return data;
}

/**
 * 期望会话已完成（使用 CLI）
 */
export async function expectSessionCompleted(sessionId: string): Promise<void> {
  const result = await runCli(['status', sessionId, '--json=status,detail']);
  // Terminal sessions return 410 Gone, but CLI handles it gracefully
  const data = JSON.parse(result.stdout);
  expect(data.status).toBe('gone');
  expect(data.detail).toBe('completed');
}

/**
 * 期望会话已取消（使用 CLI）
 */
export async function expectSessionCancelled(sessionId: string, reason?: string): Promise<void> {
  const result = await runCli(['status', sessionId, '--json=status,detail,reason']);
  const data = JSON.parse(result.stdout);
  expect(data.status).toBe('gone');
  expect(data.detail).toBe('cancelled');
  if (reason) expect(data.reason).toBe(reason);
}

/**
 * 完成会话（使用 CLI）
 */
export async function completeSession(sessionId: string): Promise<void> {
  const result = await runCli(['complete', sessionId]);
  if (result.code !== 0) {
    throw new Error('completeSession failed: ' + result.stderr);
  }
}

/**
 * 取消会话（使用 CLI）
 */
export async function cancelSession(sessionId: string, reason: string): Promise<void> {
  const result = await runCli(['cancel', sessionId, '--reason', reason]);
  if (result.code !== 0) {
    throw new Error('cancelSession failed: ' + result.stderr);
  }
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
  // Temporarily disable TLS verification for self-signed certs in e2e
  const origValue = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    const resp = await fetch(`${GRILLING_SLEEK_SERVER}/v1/sessions/${sessionId}/rounds`);
    if (!resp.ok) {
      throw new Error(`listRounds failed: ${resp.status} ${await resp.text()}`);
    }
    return (await resp.json()) as RoundSummary[];
  } finally {
    if (origValue !== undefined) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = origValue;
    } else {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    }
  }
}
