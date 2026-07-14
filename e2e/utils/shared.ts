/**
 * 共享工具函数
 */

import { randomUUID } from 'node:crypto';

/**
 * 生成唯一 ID
 */
export function uniqueId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

/**
 * 等待指定时间
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 格式化日期为 RFC 3339
 */
export function toRFC3339(date: Date): string {
  return date.toISOString();
}

/**
 * 解析 RFC 3339 日期
 */
export function parseRFC3339(dateStr: string): Date {
  return new Date(dateStr);
}
