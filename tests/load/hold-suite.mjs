#!/usr/bin/env node
// S1 持仓成本套件 —— 回答「2c/2g 下最多能同时挂多少活跃会话」。
//
// 逐级累计活跃会话（默认 500→1000→2000→5000→10000），每级：
//   1. 并发创建会话（P50 8KB 载荷，记录创建延迟）
//   2. 每个会话建立一条 SSE 连接（浏览器侧形态，static 重连 1s）
//   3. 抽样 poll-fraction 的会话跑 agent 侧 55s 长轮询循环
//   4. 稳态保持 steady 秒，期间资源采样由外部 sampler.sh 负责
// 资源-级别的对齐靠 markers.jsonl（analyze.py 合并用）。
//
// 用法：
//   node hold-suite.mjs --base https://localhost:8443 \
//     --levels 500,1000,2000,5000,10000 --steady 300 --poll-fraction 0.1 \
//     --out /tmp/s1
// 停止：SIGINT（Ctrl-C）→ 写 summary 退出，会话留在服务端等 TTL。

import fs from 'node:fs';
import path from 'node:path';
import { request, sseConnect, JSON_HDRS } from './lib/http.mjs';

function parseArgs(argv) {
  const a = {
    base: 'https://localhost:8443',
    levels: [500, 1000, 2000, 5000, 10000],
    steady: 300,
    pollFraction: 0.1,
    connectRate: 50, // SSE 建连速率（条/秒），避免 SYN 齐射
    createConcurrency: 32,
    out: '/tmp/s1',
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '');
    const v = argv[i + 1];
    if (k === 'levels') a.levels = v.split(',').map(Number);
    else if (k === 'poll-fraction') a.pollFraction = Number(v);
    else if (k === 'steady' || k === 'connect-rate' || k === 'create-concurrency') a[k.replace(/-(\w)/, (_, c) => c.toUpperCase())] = Number(v);
    else a[k] = v;
    i++;
  }
  return a;
}

// 种子化载荷（与 lib/payload.js 同分布；Node 侧内联精简版）
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildGrilling(seed) {
  const rng = mulberry32(seed);
  // P50 8KB 分布的简化：均匀夹在 5KB-16KB
  const target = Math.round(5000 + rng() * 11000);
  const n = Math.min(20, Math.max(5, Math.round(target / 1024)));
  const questions = [];
  for (let j = 0; j < n; j++) {
    questions.push({
      id: 'q' + (j + 1),
      header: 'Question ' + (j + 1),
      text: 'Please describe your approach',
      type: 'single',
      options: [{ label: 'open-source' }, { label: 'in-house' }, { label: 'managed' }, { label: 'hybrid' }],
    });
  }
  const actual = JSON.stringify({ name: 'X', questions }).length;
  const gap = target - actual;
  if (gap > 0) {
    const per = Math.floor(gap / n);
    const pad = 'x'.repeat(per);
    for (let k = 0; k < n; k++) questions[k].text += '\n\n' + pad;
  }
  return JSON.stringify({ name: 'S1 Hold Session', questions });
}

const args = parseArgs(process.argv);
fs.mkdirSync(args.out, { recursive: true });
const markers = fs.createWriteStream(path.join(args.out, 'markers.jsonl'));
const metrics = fs.createWriteStream(path.join(args.out, 'metrics.jsonl'));
const createLog = fs.createWriteStream(path.join(args.out, 'create-latency.jsonl'));

const state = {
  sessions: [], // {id, sse: handle|null, sseBytes, reconnects, polled}
  sseConnected: 0,
  sseReconnects: 0,
  pollInflight: 0,
  pollTotal: 0,
  pollStatuses: {},
  pollersAlive: 0,
  bytesIn: 0,
  stopped: false,
};

function logMarker(event, level, extra = {}) {
  markers.write(JSON.stringify({ t: Date.now(), event, level, ...extra }) + '\n');
}

async function createOne(i) {
  const body = buildGrilling(1000 + i);
  const res = await request('POST', `${args.base}/v1/sessions`, { headers: JSON_HDRS, body, timeoutMs: 30000 });
  createLog.write(JSON.stringify({ t: Date.now(), ms: res.ms, status: res.status, bytes: body.length }) + '\n');
  if (res.status === 201) {
    try {
      return JSON.parse(res.body).session_id;
    } catch {
      return null;
    }
  }
  return null;
}

/// 以 createConcurrency 并发补齐到 targetTotal 个会话。
/// 精确封顶：cursor(已领号) - failed(已完成失败) = 成功+在飞，JS 单线程内同步判定。
async function ensureSessions(targetTotal) {
  const want = targetTotal - state.sessions.length;
  if (want <= 0) return { created: 0, failed: 0 };
  let cursor = 0;
  let created = 0;
  let failed = 0;
  const workers = Array.from({ length: Math.min(args.createConcurrency, want) }, async () => {
    while (!state.stopped) {
      if (cursor - failed >= want) break;
      const mine = cursor++;
      const id = await createOne(1000 + totalSeeded + mine);
      if (id) {
        created++;
        state.sessions.push({ id, sse: null, sseBytes: 0, reconnects: 0, polled: false });
      } else {
        failed++;
        if (failed > 100) throw new Error('create keeps failing');
      }
    }
  });
  await Promise.all(workers);
  totalSeeded += cursor;
  return { created, failed };
}
let totalSeeded = 0;

/// SSE 建连（限速 connectRate 条/秒）。
async function connectSse(session) {
  const s = session;
  const handle = sseConnect(`${args.base}/v1/sessions/${s.id}/events`, (n) => {
    s.sseBytes += n;
    state.bytesIn += n;
  });
  s.sse = handle;
  state.sseConnected++;
  handle.promise.then(() => {
    if (state.stopped) return;
    state.sseConnected--;
    // static 模式：断开 1s 后重连（持仓成本测量，不模拟 web 退避）
    state.sseReconnects++;
    s.reconnects++;
    setTimeout(() => {
      if (!state.stopped) connectSse(s);
    }, 1000);
  });
}

async function connectAllSse(fromIdx) {
  const t0 = Date.now();
  for (let i = fromIdx; i < state.sessions.length; i++) {
    if (state.stopped) break;
    connectSse(state.sessions[i]);
    // 限速
    const expect = (i - fromIdx + 1) / args.connectRate;
    const elapsed = (Date.now() - t0) / 1000;
    if (expect > elapsed) await new Promise((r) => setTimeout(r, (expect - elapsed) * 1000));
  }
}

/// agent 侧长轮询循环（抽样会话）。
function startPoll(session) {
  if (session.polled) return;
  session.polled = true;
  state.pollersAlive++;
  const loop = async () => {
    while (!state.stopped) {
      state.pollInflight++;
      state.pollTotal++;
      const res = await request(
        'GET',
        `${args.base}/v1/sessions/${session.id}/rounds/1/response?wait=55`,
        { headers: JSON_HDRS, timeoutMs: 65000 },
      );
      state.pollInflight--;
      state.pollStatuses[res.status] = (state.pollStatuses[res.status] || 0) + 1;
      if (res.status === 0) {
        await new Promise((r) => setTimeout(r, 2000));
      } else if (res.status === 202) {
        continue; // 立即下一轮 —— 与 CLI pollLoop 一致
      } else {
        state.pollersAlive--;
        return; // 200/410/404 —— 会话终态或会话丢失，停止轮询
      }
    }
    state.pollersAlive--;
  };
  loop();
}

function startPolling(fraction) {
  const idx = state.sessions.map((s, i) => i).filter((i) => i < fraction * state.sessions.length && !state.sessions[i].polled);
  for (const i of idx) startPoll(state.sessions[i]);
}

// 指标采样循环
setInterval(() => {
  metrics.write(
    JSON.stringify({
      t: Date.now(),
      target: state.sessions.length,
      sseConnected: state.sseConnected,
      sseReconnects: state.sseReconnects,
      pollInflight: state.pollInflight,
      pollTotal: state.pollTotal,
      pollersAlive: state.pollersAlive,
      pollStatuses: state.pollStatuses,
      bytesIn: state.bytesIn,
    }) + '\n',
  );
}, 5000);

async function main() {
  console.log(`[hold-suite] base=${args.base} levels=${args.levels} steady=${args.steady}s poll=${args.pollFraction}`);
  for (const level of args.levels) {
    if (state.stopped) break;
    logMarker('level_start', level);
    const fromIdx = state.sessions.length;
    const { created, failed } = await ensureSessions(level);
    logMarker('level_created', level, { created, failed });
    console.log(`[hold-suite] level ${level}: +${created} created (${failed} failed), connecting SSE...`);
    await connectAllSse(fromIdx);
    logMarker('level_sse_connected', level, { sse: state.sseConnected });
    startPolling(args.pollFraction);
    console.log(`[hold-suite] level ${level}: SSE=${state.sseConnected}, polling ~${Math.round(args.pollFraction * state.sessions.length)} sessions; steady ${args.steady}s`);
    logMarker('steady_start', level);
    const until = Date.now() + args.steady * 1000;
    while (Date.now() < until && !state.stopped) await new Promise((r) => setTimeout(r, 1000));
    logMarker('steady_end', level, { sse: state.sseConnected, pollTotal: state.pollTotal, bytesIn: state.bytesIn });
    console.log(`[hold-suite] level ${level}: steady done. sse=${state.sseConnected} reconnects=${state.sseReconnects} polls=${state.pollTotal}`);
  }
}

process.on('SIGINT', () => {
  console.log('[hold-suite] SIGINT — stopping (sessions left parked on server)');
  state.stopped = true;
  setTimeout(() => {
    markers.end();
    metrics.end();
    createLog.end();
    process.exit(0);
  }, 500);
});

main().catch((e) => {
  console.error('[hold-suite] fatal:', e);
  state.stopped = true;
  markers.end();
  metrics.end();
  createLog.end();
  process.exit(1);
});
