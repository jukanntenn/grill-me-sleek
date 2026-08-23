// CLI 语义封装 —— 在 k6 里复刻 cli/src/api.ts 的 ky 客户端行为，让压测的
// 失败/退避形态与真实 agent 一致：
//   - 对 408/413/429/500/502/503/504 重试 3 次，指数退避（0.3s 起步），
//     尊重 Retry-After（上限 30s）
//   - 创建类请求带 Idempotency-Key（重放安全）
//
// 浏览器侧（fetch，无重试）用 bareGet/bareSend。

import http from 'k6/http';
import { sleep } from 'k6';

const RETRY_STATUSES = new Set([408, 413, 429, 500, 502, 503, 504]);
const RETRY_LIMIT = 3;
const BACKOFF_BASE_S = 0.3;
const MAX_RETRY_AFTER_S = 30;

export const GZIP_HEADERS = {
  'Content-Type': 'application/json',
  // 生产链路 CF/Caddy 全程压缩；k6 默认不带，必须显式声明才真实
  'Accept-Encoding': 'gzip',
};

/// agent 侧请求头（含幂等键）。
export function agentHdrs(idemKey) {
  const h = Object.assign({}, GZIP_HEADERS);
  if (idemKey) h['Idempotency-Key'] = idemKey;
  return h;
}

/// 进程级 RUN_ID —— 幂等键必须跨压测进程唯一：同种子重跑时若复用旧键，
/// 服务端幂等缓存（TTL 5min）会重放上个 run 的会话，污染场景。
const RUN_ID = __ENV.RUN_ID || String(Date.now());

/// 全局唯一（单次压测进程内）幂等键。
let idemSeq = 0;
export function makeIdemKey(tag) {
  idemSeq += 1;
  return `k6-${tag}-${RUN_ID}-${__VU}-${idemSeq}`;
}

function retryAfterSec(res) {
  const v = res.headers['Retry-After'];
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(n, MAX_RETRY_AFTER_S) : null;
}

/// 带重试的请求（CLI/agent 侧语义）。fn 必须发起一次请求并返回 k6 Response。
/// 返回 { res, attempts, gaveUp } —— gaveUp=true 表示重试耗尽仍失败。
export function withRetry(fn, tag) {
  let res = fn();
  let attempts = 1;
  while (attempts <= RETRY_LIMIT && RETRY_STATUSES.has(res.status)) {
    const ra = retryAfterSec(res);
    const delay = ra !== null ? ra : BACKOFF_BASE_S * Math.pow(2, attempts - 1);
    sleep(delay);
    res = fn();
    attempts += 1;
  }
  return { res, attempts, gaveUp: RETRY_STATUSES.has(res.status) };
}

/// agent 长轮询一次：wait 秒内等到 200（有答案）/ 202（超时未答）/ 终态 JSON。
export function pollOnce(baseUrl, sessionId, round, waitSec, tag) {
  const url = `${baseUrl}/v1/sessions/${sessionId}/rounds/${round}/response?wait=${waitSec}`;
  const res = http.get(url, { headers: GZIP_HEADERS, tags: { name: tag } });
  return res;
}

/// 浏览器侧请求（fetch 语义：不重试，直接返回）。
export function bareGet(url, tag) {
  return http.get(url, { headers: GZIP_HEADERS, tags: { name: tag } });
}

export function bareSend(method, url, body, tag) {
  const params = { headers: GZIP_HEADERS, tags: { name: tag } };
  if (method === 'POST') return http.post(url, body, params);
  if (method === 'PUT') return http.put(url, body, params);
  if (method === 'PATCH') return http.patch(url, body, params);
  throw new Error('unsupported method ' + method);
}
