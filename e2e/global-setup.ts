/**
 * 全局设置
 */

import { FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('[Global Setup] Starting E2E test environment...');

  // 可以在这里进行一些全局初始化
  // 例如：等待服务就绪、准备测试数据等

  console.log('[Global Setup] E2E test environment is ready!');
}

export default globalSetup;
