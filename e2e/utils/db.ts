/**
 * 数据库操作工具
 * 
 * 通过 Docker exec 执行 SQLite 命令
 */

import { execSync } from 'node:child_process';

const CONTAINER_NAME = 'grill-sleek-e2e-app-1';
const DB_PATH = '/app/data/e2e-test.db';

/**
 * 执行 SQL 命令
 */
export function execSql(sql: string): string {
  try {
    const result = execSync(
      `docker exec ${CONTAINER_NAME} sqlite3 ${DB_PATH} "${sql}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return result.trim();
  } catch (error: any) {
    console.error(`Failed to execute SQL: ${sql}`, error.message);
    throw error;
  }
}

/**
 * 模拟会话过期
 * 
 * 通过修改数据库中的 expires_at 字段来模拟会话过期
 */
export function simulateSessionExpired(sessionId: string): void {
  // 将 expires_at 设置为过去的时间
  const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1小时前
  execSql(
    `UPDATE sessions SET expires_at = ${pastTime} WHERE id = '${sessionId}';`
  );
  
  // 触发 sweeper 来清理过期会话
  // 注意：这可能需要等待 sweeper 运行
}

/**
 * 获取会话状态
 */
export function getSessionStatus(sessionId: string): string | null {
  try {
    const result = execSql(
      `SELECT status FROM sessions WHERE id = '${sessionId}';`
    );
    return result || null;
  } catch {
    return null;
  }
}

/**
 * 检查会话是否存在
 */
export function sessionExists(sessionId: string): boolean {
  const result = execSql(
    `SELECT COUNT(*) FROM sessions WHERE id = '${sessionId}';`
  );
  return result === '1';
}
