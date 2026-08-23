#!/usr/bin/env node
// S5 重连风暴风扇架 —— 按 web/src/hooks/useSSE.ts 的真实状态机模拟 N 个浏览器
// tab：SSE 断开 → 无抖动指数退避（1/2/4/8/16s，cap 30s）→ GET current 全量重同步
// → 重连 SSE；连续失败 5 分钟放弃。用于测量服务端闪断后的同步重连波。
//
// 用法：
//   node sse-holder.mjs --base https://localhost:8443 --ids /tmp/s5-ids.json \
//     --duration 600 --out /tmp/s5
// ids 文件为 JSON 数组（由 hold-suite 的会话创建逻辑或手工产生）；
// 若给 --count 则自行创建临时会话。

import fs from 'node:fs';
import path from 'node:path';
import { request, sseConnect, JSON_HDRS } from './lib/http.mjs';

function parseArgs(argv) {
  const a = { base: 'https://localhost:8443', ids: null, count: 0, duration: 600, out: '/tmp/s5' };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '');
    a[k] = argv[i + 1];
    i++;
  }
  a.count = Number(a.count);
  a.duration = Number(a.duration);
  return a;
}

const args = parseArgs(process.argv);
fs.mkdirSync(args.out, { recursive: true });
const metrics = fs.createWriteStream(path.join(args.out, 'metrics.jsonl'));
const events = fs.createWriteStream(path.join(args.out, 'events.jsonl'));

const state = {
  connected: 0,
  reconnects: 0,
  getcurrent: 0,
  getcurrentFail: 0,
  gaveUp: 0,
  bytesIn: 0,
};

async function createSessions(count, concurrency = 32) {
  const ids = [];
  let cursor = 0;
  const body = JSON.stringify({
    name: 'S5 Storm',
    questions: [
      { id: 'q1', header: 'Q1', text: 'Describe your approach. ' + 'y'.repeat(7000), type: 'single',
        options: [{ label: 'a' }, { label: 'b' }] },
    ],
  });
  const workers = Array.from({ length: Math.min(concurrency, count) }, async () => {
    while (cursor < count) {
      const i = cursor++;
      const res = await request('POST', `${args.base}/v1/sessions`, { headers: JSON_HDRS, body, timeoutMs: 30000 });
      if (res.status === 201) {
        try {
          ids.push(JSON.parse(res.body).session_id);
        } catch {}
      }
    }
  });
  await Promise.all(workers);
  return ids;
}

/// 复刻 useSSE 的重连状态机（关键：退避无抖动 → 所有 tab 齐步走）。
function runTab(sessionId) {
  let stopped = false;
  let failSince = 0;
  let handle = null;

  const connect = () => {
    if (stopped) return;
    handle = sseConnect(`${args.base}/v1/sessions/${sessionId}/events`, (n) => {
      state.bytesIn += n;
    });
    state.connected++;
    handle.promise.then(() => {
      if (stopped) return;
      state.connected--;
      reconnect(1);
    });
  };

  const reconnect = (attempt) => {
    if (stopped) return;
    if (failSince === 0) failSince = Date.now();
    if (Date.now() - failSince > 5 * 60 * 1000) {
      state.gaveUp++;
      events.write(JSON.stringify({ t: Date.now(), ev: 'gave_up', sessionId }) + '\n');
      return; // PAGE_RECONNECT_FAILED —— 放弃
    }
    const delay = Math.min(Math.pow(2, attempt - 1), 30) * 1000; // 与 useSSE 完全一致（无抖动）
    setTimeout(async () => {
      if (stopped) return;
      const res = await request('GET', `${args.base}/v1/sessions/${sessionId}/rounds/current`, { headers: JSON_HDRS, timeoutMs: 15000 });
      state.getcurrent++;
      state.bytesIn += res.bytes;
      if (res.status === 200) {
        failSince = 0;
        state.reconnects++;
        events.write(JSON.stringify({ t: Date.now(), ev: 'reconnected', sessionId }) + '\n');
        connect();
      } else if (res.status === 404 || res.status === 410) {
        return; // 会话没了，tab 结束
      } else {
        state.getcurrentFail++;
        reconnect(attempt + 1);
      }
    }, delay);
  };

  connect();
  return () => {
    stopped = true;
    if (handle) handle.close();
  };
}

setInterval(() => {
  metrics.write(JSON.stringify({ t: Date.now(), ...state }) + '\n');
}, 2000);

async function main() {
  let ids = [];
  if (args.ids) {
    ids = JSON.parse(fs.readFileSync(args.ids, 'utf8'));
  } else if (args.count > 0) {
    console.log(`[sse-holder] creating ${args.count} sessions...`);
    ids = await createSessions(args.count);
    fs.writeFileSync(path.join(args.out, 'ids.json'), JSON.stringify(ids));
  } else {
    throw new Error('need --ids <file> or --count N');
  }
  console.log(`[sse-holder] ${ids.length} tabs, duration ${args.duration}s — starting`);
  const start = Date.now();
  // 与 hold-suite 不同：一次性全量建连（风暴场景本就要瞬时建立）
  for (const id of ids) runTab(id);
  await new Promise((r) => setTimeout(r, args.duration * 1000 - (Date.now() - start)));
  console.log('[sse-holder] done', JSON.stringify(state));
  events.end();
  metrics.end();
  process.exit(0);
}

process.on('SIGINT', () => {
  events.end();
  metrics.end();
  process.exit(0);
});

main().catch((e) => {
  console.error('[sse-holder] fatal:', e);
  process.exit(1);
});
