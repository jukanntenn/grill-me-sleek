/**
 * 全局清理
 */

import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('[Global Teardown] Cleaning up E2E test environment...');

  // 可以在这里进行一些全局清理
  // 例如：清理测试数据、停止服务等

  console.log('[Global Teardown] E2E test environment cleaned up!');
}

export default globalTeardown;
