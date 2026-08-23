// 真实生命周期压测（S0 基线 / S2 到达率扫描 / S3 尖峰 / S4 退化合约 / S7 浸泡共用）。
//
// 一个迭代 = 一个完整「拷问会话」，按业务画像参数表建模（README §场景套件）：
//   会话结局  完成 60% / 取消 10% / 弃答 30%（agent 轮询 10min 后放弃，会话挂到 TTL）
//   轮数      1 轮 40% / 2 轮 35% / 3 轮 25%
//   修订      每个已答轮 20% 概率被修订 1-2 次（PUT revise）
//   载荷      P50 8KB / P99 ~32KB / 峰值 63KB（种子化可复现）
//   时序      读题 P50 30s / 轮间 P50 120s（对数正态），agent 长轮询 wait≤55s
//   客户端    agent 侧带 ky 语义（重试 3 次 + 尊重 Retry-After + 幂等键）；
//             浏览器侧 fetch 语义（不重试）
//
// 模式：
//   MODE=closed  （默认）固定 VU 数 —— 轻量验证用
//   MODE=arrival 开模型到达率 —— ARRIVAL_RATE_PER_MIN + RAMP + HOLD，
//                稳态活跃数按 Little 定律 ≈ 到达率 × 平均会话时长
//
// 所有人类时间 × DURATION_SCALE（仅验证时压缩，正式跑必须 =1）。
//
// SSE 不在本脚本内（k6 不支持流式响应）——持仓成本由 hold-suite.mjs 单独测量。

import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { makeRng, sampleLognormal, samplePayloadSize, buildGrilling, buildAnswers, buildRevisedAnswers } from './lib/payload.js';
import { makeIdemKey, withRetry, pollOnce, bareGet, bareSend, agentHdrs } from './lib/client.js';

// ── 环境 ───────────────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'https://localhost:8443';
const MODE = __ENV.MODE || 'closed';
const SEED = Number(__ENV.SEED || 42);
const SCALE = Number(__ENV.DURATION_SCALE || 1); // 正式压测必须为 1

const ARRIVAL_RATE_PER_MIN = Number(__ENV.ARRIVAL_RATE_PER_MIN || 60);
const RAMP = __ENV.RAMP || '30s';
const HOLD = __ENV.HOLD || '5m';
const VU_POOL = Number(__ENV.VU_POOL || 600);
const VU_MAX = Number(__ENV.VU_MAX || 3000);
const CLOSED_VUS = Number(__ENV.VUS || 5);
const CLOSED_DURATION = __ENV.DURATION || '60s';

// ── 会话画像常量（秒；× SCALE 生效）─────────────────────────────────────────
const READ_THINK = { p50: 30, p95: 240, cap: 600 };
const INTER_ROUND = { p50: 120, p95: 480, cap: 900 };
const AGENT_GIVEUP = 600;
const REVISE_DELAY = { p50: 20, p95: 60, cap: 120 };

// ── 指标 ───────────────────────────────────────────────────────────────────
const sessionOutcome = new Counter('session_outcome');
const sessionDuration = new Trend('session_duration_s', true);
const degraded500 = new Counter('http_500_by_endpoint');
const rateLimited = new Counter('http_429_by_endpoint');
const retriedReqs = new Counter('retried_requests');

// ── 执行器 ─────────────────────────────────────────────────────────────────
export const options =
  MODE === 'arrival'
    ? {
        insecureSkipTLSVerify: true,
        scenarios: {
          lifecycle: {
            executor: 'ramping-arrival-rate',
            startRate: 0,
            timeUnit: '1m',
            preAllocatedVUs: VU_POOL,
            maxVUs: VU_MAX,
            stages: [
              { duration: RAMP, target: ARRIVAL_RATE_PER_MIN },
              { duration: HOLD, target: ARRIVAL_RATE_PER_MIN },
            ],
            gracefulStop: '60s',
          },
        },
      }
    : {
        insecureSkipTLSVerify: true,
        vus: CLOSED_VUS,
        duration: CLOSED_DURATION,
      };

// ── 工具 ───────────────────────────────────────────────────────────────────
function hashSeed(vu, iter) {
  let h = 2166136261 ^ SEED;
  const s = `${vu}:${iter}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function scaled(sec) {
  return sec * SCALE;
}

function thinkSleep(rng, spec) {
  const v = sampleLognormal(rng, spec.p50, spec.p95, spec.cap);
  sleep(Math.max(0.05, scaled(v)));
}

function count500(res, tag) {
  if (res.status >= 500) degraded500.add(1, { name: tag });
  if (res.status === 429) rateLimited.add(1, { name: tag });
}

/// agent 在浏览器读题期间的长轮询循环：直到 deadline 或拿到答案/终态。
/// 返回 'deadline' | 'answered' | 'terminal'。
function agentWaitForAnswer(sessionId, round, deadlineAtMs, giveUpAtMs) {
  while (true) {
    const now = Date.now();
    const remain = Math.min(deadlineAtMs, giveUpAtMs) - now;
    if (remain <= 0) return now >= giveUpAtMs && now >= deadlineAtMs ? 'deadline' : 'deadline';
    const wait = Math.min(55, Math.ceil(remain / 1000));
    const res = pollOnce(BASE_URL, sessionId, round, wait, 'agent_poll');
    count500(res, 'agent_poll');
    if (res.status === 200) {
      const body = res.json();
      if (body && (body.status === 'cancelled' || body.status === 'expired')) return 'terminal';
      return 'answered';
    }
    if (res.status === 202) continue; // 未答，继续等
    if (res.status === 410) return 'terminal';
    // 其他状态（429/5xx 已在 pollOnce 外层语义里）—— 短退避再试
    sleep(1);
  }
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
export default function () {
  const t0 = Date.now();
  const rng = makeRng(hashSeed(__VU, __ITER));

  // 会话画像抽样
  const size = samplePayloadSize(rng);
  const grilling = buildGrilling(rng, size, 'Grilling Session');
  const roll = rng();
  const outcome = roll < 0.6 ? 'complete' : roll < 0.7 ? 'cancel' : 'abandon';
  const roundsRoll = rng();
  const nRounds = roundsRoll < 0.4 ? 1 : roundsRoll < 0.75 ? 2 : 3;
  const giveUpAt = Date.now() + scaled(AGENT_GIVEUP) * 1000;

  // agent 创建会话（ky 语义：重试 + 幂等键）
  const createIdem = makeIdemKey('session');
  const created = withRetry(
    () => http.post(`${BASE_URL}/v1/sessions`, JSON.stringify(grilling), {
      headers: agentHdrs(createIdem),
      tags: { name: 'create_session' },
    }),
    'create_session',
  );
  count500(created.res, 'create_session');
  if (created.attempts > 1) retriedReqs.add(created.attempts - 1, { name: 'create_session' });
  if (created.res.status !== 201) {
    sessionOutcome.add(1, { kind: 'failed_create' });
    return;
  }
  const sessionId = created.res.json('session_id');

  // 用户打开链接读题
  sleep(Math.max(0.2, scaled(sampleLognormal(rng, 3, 10, 30))));

  // ── 弃答：agent 独自轮询到放弃，会话挂到 TTL ─────────────────────────────
  if (outcome === 'abandon') {
    agentWaitForAnswer(sessionId, 1, giveUpAt, giveUpAt);
    sessionOutcome.add(1, { kind: 'abandoned' });
    sessionDuration.add((Date.now() - t0) / 1000);
    return;
  }

  let failed = false;

  for (let round = 1; round <= nRounds && !failed; round++) {
    if (round > 1) {
      thinkSleep(rng, INTER_ROUND); // agent 准备下一轮
      const r = withRetry(
        () =>
          http.post(`${BASE_URL}/v1/sessions/${sessionId}/rounds`, JSON.stringify(grilling), {
            headers: agentHdrs(makeIdemKey('round')),
            tags: { name: 'create_round' },
          }),
        'create_round',
      );
      count500(r.res, 'create_round');
      if (r.attempts > 1) retriedReqs.add(r.attempts - 1, { name: 'create_round' });
      if (r.res.status !== 201) {
        sessionOutcome.add(1, { kind: 'failed_mid' });
        failed = true;
        break;
      }
    }

    // 浏览器读题 + agent 同步长轮询（单 VU 顺序近似：轮询覆盖读题窗口）
    const browserThinkMs = scaled(sampleLognormal(rng, READ_THINK.p50, READ_THINK.p95, READ_THINK.cap)) * 1000;
    const thinkDeadline = Date.now() + browserThinkMs;
    const g = bareGet(`${BASE_URL}/v1/sessions/${sessionId}/rounds/current`, 'get_current');
    count500(g, 'get_current');

    const waitRes = agentWaitForAnswer(sessionId, round, thinkDeadline, giveUpAt);

    // 取消：最后一轮读完后用户取消（浏览器语义，不重试）
    if (outcome === 'cancel' && round === nRounds) {
      const c = bareSend('PATCH', `${BASE_URL}/v1/sessions/${sessionId}`, JSON.stringify({ status: 'cancelled' }), 'cancel_session');
      count500(c, 'cancel_session');
      if (c.status === 200) {
        sessionOutcome.add(1, { kind: 'cancelled' });
      } else {
        sessionOutcome.add(1, { kind: 'failed_mid' });
      }
      sessionDuration.add((Date.now() - t0) / 1000);
      return;
    }

    if (waitRes === 'terminal' || waitRes === 'deadline') {
      // 读题窗口耗尽但未答 —— 继续流程（用户思考完才作答）；deadline 仅指读题窗口
    }

    // 浏览器提交答案（fetch 语义，不重试）
    const answers = buildAnswers(grilling);
    const s = bareSend(
      'POST',
      `${BASE_URL}/v1/sessions/${sessionId}/rounds/${round}/response`,
      JSON.stringify(answers),
      'submit_response',
    );
    count500(s, 'submit_response');
    if (s.status !== 201) {
      sessionOutcome.add(1, { kind: 'failed_mid' });
      failed = true;
      break;
    }

    // agent 取到答案
    const got = agentWaitForAnswer(sessionId, round, Date.now() + scaled(10) * 1000, giveUpAt);
    if (got === 'terminal') {
      sessionOutcome.add(1, { kind: 'cancelled' });
      sessionDuration.add((Date.now() - t0) / 1000);
      return;
    }

    // 20% 概率修订 1-2 次
    const rv = rng();
    if (rv < 0.2) {
      const times = rv < 0.15 ? 1 : 2;
      for (let i = 0; i < times; i++) {
        thinkSleep(rng, REVISE_DELAY);
        const revised = buildRevisedAnswers(grilling);
        const put = bareSend(
          'PUT',
          `${BASE_URL}/v1/sessions/${sessionId}/rounds/${round}/response`,
          JSON.stringify(revised),
          'revise_response',
        );
        count500(put, 'revise_response');
        if (put.status !== 200) break;
      }
    }
  }

  if (!failed) {
    const done = bareSend(
      'PATCH',
      `${BASE_URL}/v1/sessions/${sessionId}`,
      JSON.stringify({ status: 'completed' }),
      'complete_session',
    );
    count500(done, 'complete_session');
    sessionOutcome.add(1, { kind: done.status === 200 ? 'completed' : 'failed_mid' });
  }
  sessionDuration.add((Date.now() - t0) / 1000);
}


// ── 汇总 ───────────────────────────────────────────────────────────────────
export function handleSummary(data) {
  const m = data.metrics;
  const line = (label, metric, field) => {
    const v = m[metric] && m[metric].values;
    return `  ${label.padEnd(28)} ${v ? JSON.stringify(v[field] !== undefined ? v[field] : v) : '-'}`;
  };
  // 结局分布（completed/cancelled/abandoned/failed_*）由 analyze.py outcomes 从点数据聚合
  const outcomeTotal = m.session_outcome ? m.session_outcome.values.count : 0;
  return {
    stdout:
      '\n======== LIFECYCLE SUMMARY ========\n' +
      `  mode=${MODE} scale=${SCALE} seed=${SEED}\n` +
      `  iterations:     ${m.iterations ? m.iterations.values.count : 0}\n` +
      `  sessions ended: ${outcomeTotal}（分布: analyze.py outcomes）\n` +
      line('session_duration med', 'session_duration_s', 'med') +
      '\n' +
      line('session_duration p95', 'session_duration_s', 'p(95)') +
      '\n' +
      line('http reqs', 'http_reqs', 'count') +
      '\n' +
      `  data_sent:      ${((m.data_sent ? m.data_sent.values.count : 0) / 1048576).toFixed(1)} MB\n` +
      `  data_received:  ${((m.data_received ? m.data_received.values.count : 0) / 1048576).toFixed(1)} MB\n` +
      '===================================\n',
  };
}
