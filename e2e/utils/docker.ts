/**
 * Docker 管理工具
 *
 * 借鉴 obsidian-livesync 的 Docker 管理策略
 */

import { execSync } from 'node:child_process';

const COMPOSE_FILE = 'docker-compose.e2e.yml';
const PROJECT_NAME = 'grill-sleek-e2e';

/**
 * 启动 Docker Compose 环境
 */
export function startDockerCompose() {
  console.log('[INFO] Starting Docker Compose environment...');
  execSync(`docker compose -f ${COMPOSE_FILE} -p ${PROJECT_NAME} up -d`, {
    stdio: 'inherit',
  });

  // 等待服务就绪
  waitForService();
}

/**
 * 停止 Docker Compose 环境
 */
export function stopDockerCompose() {
  console.log('[INFO] Stopping Docker Compose environment...');
  execSync(`docker compose -f ${COMPOSE_FILE} -p ${PROJECT_NAME} down`, {
    stdio: 'inherit',
  });
}

/**
 * 清理 Docker Compose 环境（包括 volumes）
 */
export function cleanupDockerCompose() {
  console.log('[INFO] Cleaning up Docker Compose environment...');
  execSync(`docker compose -f ${COMPOSE_FILE} -p ${PROJECT_NAME} down -v`, {
    stdio: 'inherit',
  });
}

/**
 * 等待服务就绪
 */
function waitForService(maxRetries = 30, intervalMs = 2000) {
  const serverUrl = process.env.GRILLING_SLEEK_SERVER ?? 'https://localhost:8443';

  for (let i = 0; i < maxRetries; i++) {
    try {
      execSync(`curl -sf ${serverUrl}/v1/healthz`, { stdio: 'pipe' });
      console.log('[INFO] Service is ready!');
      return;
    } catch {
      console.log(`[INFO] Waiting for service... (${i + 1}/${maxRetries})`);
      execSync(`sleep ${intervalMs / 1000}`);
    }
  }

  throw new Error('Service failed to start within timeout');
}
