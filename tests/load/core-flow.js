// 主业务流压测：一个 VU = 一个完整的「拷问会话」生命周期。
//
// 场景模型对照真实用法（CLI agent + 网页用户双角色）：
//   agent 创建会话(32KB 题目) → 用户浏览器打开链接读题(GET current) →
//   agent 长轮询等待答案(202 超时) → 用户提交答案(8KB) →
//   agent 长轮询取到答案(200) → 下一轮 → 三轮后完成归档(PATCH)。
//
// 运行档位（-e PROFILE=…，默认 smoke）：
//   smoke   CI 冒烟：10 VU × 1m，验证链路与吞吐基线
//   steps   甜点区搜索：10→200 VU 阶梯，观察 p95 / 错误率 / 内存拐点
//   soak    稳定性：30 VU × 30m，观察 WAL 与内存增长
//   extreme 极限：500 VU 突发，配合 docker 资源限制找崩塌点
//
// 基础地址可用 -e BASE_URL 覆盖；自签名 TLS 默认跳过校验。

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

// ── Custom bandwidth metrics ──────────────────────────────────────────────
const bandwidthUp = new Trend('bandwidth_up_bytes');
const bandwidthDown = new Trend('bandwidth_down_bytes');
const totalDataSent = new Counter('total_data_sent');
const totalDataReceived = new Counter('total_data_received');

// ── Configuration ─────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'https://localhost:8443';
const PROFILE = __ENV.PROFILE || 'smoke';

const TARGET_QUESTION_SIZE = 32000; // ~32KB for grilling payload
const TARGET_RESPONSE_SIZE = 8000; // ~8KB for response payload
const NUM_QUESTIONS = 15;
const NUM_ROUNDS = 3;

const PROFILES = {
  smoke: [
    { duration: '10s', target: 10 },
    { duration: '50s', target: 10 },
  ],
  steps: [
    { duration: '30s', target: 10 },
    { duration: '60s', target: 25 },
    { duration: '60s', target: 25 },
    { duration: '90s', target: 50 },
    { duration: '90s', target: 50 },
    { duration: '90s', target: 100 },
    { duration: '90s', target: 100 },
    { duration: '90s', target: 150 },
    { duration: '90s', target: 150 },
    { duration: '90s', target: 200 },
    { duration: '60s', target: 200 },
    { duration: '30s', target: 0 },
  ],
  soak: [
    { duration: '30s', target: 30 },
    { duration: '30m', target: 30 },
    { duration: '30s', target: 0 },
  ],
  extreme: [
    { duration: '30s', target: 500 },
    { duration: '1m', target: 500 },
    { duration: '30s', target: 0 },
  ],
};

export const options = {
  insecureSkipTLSVerify: true,
  stages: PROFILES[PROFILE] || PROFILES.smoke,
  thresholds: {
    http_req_failed: ['rate<0.02'],
    // 每端点延迟预算（SLO）：steps 档位下高阶梯有意突破预算以暴露拐点，
    // 冒烟档位必须全绿。
    'http_req_duration{name:create_session}': ['p(95)<1000'],
    'http_req_duration{name:create_round}': ['p(95)<1000'],
    'http_req_duration{name:get_current}': ['p(95)<500'],
    'http_req_duration{name:submit_response}': ['p(95)<500'],
    // 长轮询含 2s 服务端等待，预算放宽容忍
    'http_req_duration{name:agent_wait}': ['p(95)<3500'],
    // 归档事务要搬 3 轮全量数据
    'http_req_duration{name:complete_session}': ['p(95)<1500'],
  },
};

const headers = { 'Content-Type': 'application/json' };

// ── Payload generators ────────────────────────────────────────────────────

// Build a realistic question set with size close to target bytes.
function buildQuestions(numQuestions, targetSize) {
  var topics = [
    'Architecture Design', 'Data Modeling', 'Error Handling Strategy',
    'Performance Optimization', 'Security Considerations', 'API Design',
    'Testing Methodology', 'Deployment Pipeline', 'Monitoring & Observability',
    'Database Schema', 'Caching Strategy', 'Authentication Flow',
    'Rate Limiting', 'Concurrency Model', 'State Management',
  ];

  var questions = [];
  for (var j = 0; j < numQuestions; j++) {
    var topic = topics[j % topics.length];
    questions.push({
      id: 'q' + (j + 1),
      header: 'Question ' + (j + 1) + ': ' + topic,
      text: 'Please describe your approach to ' + topic.toLowerCase(),
      type: 'single',
      options: [
        { label: 'Adopt a proven open-source solution' },
        { label: 'Build a custom in-house implementation' },
        { label: 'Use a managed cloud service' },
        { label: 'Hybrid approach combining multiple strategies' },
      ],
    });
  }

  // Measure and pad to target size
  var actual = JSON.stringify({ name: 'X', questions: questions }).length;
  var gap = targetSize - actual;
  if (gap > 0) {
    // Distribute padding across all questions' text fields
    var padPerQuestion = Math.floor(gap / numQuestions);
    var remainder = gap % numQuestions;
    for (var k = 0; k < numQuestions; k++) {
      questions[k].text += '\n\n' + generatePadding(padPerQuestion + (k < remainder ? 1 : 0));
    }
  }
  return questions;
}

// Build a response set with size close to target bytes.
function buildResponse(numQuestions, targetSize) {
  var answers = {};
  var options = ['Adopt a proven open-source solution', 'Build a custom in-house implementation', 'Use a managed cloud service', 'Hybrid approach combining multiple strategies'];
  for (var j = 0; j < numQuestions; j++) {
    answers['q' + (j + 1)] = {
      selected: options[j % options.length],
      reasoning: 'Selected based on team expertise.',
    };
  }

  // Measure and pad to target size
  var actual = JSON.stringify({ answers: answers }).length;
  var gap = targetSize - actual;
  if (gap > 0) {
    var padPerAnswer = Math.floor(gap / numQuestions);
    var remainder = gap % numQuestions;
    for (var k = 0; k < numQuestions; k++) {
      answers['q' + (k + 1)].reasoning += ' ' + generatePadding(padPerAnswer + (k < remainder ? 1 : 0));
    }
  }
  return answers;
}

// Generate deterministic padding text of ~N bytes.
function generatePadding(targetBytes) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ';
  let result = '';
  // Each char is 1 byte in UTF-8 for ASCII subset
  for (let i = 0; i < targetBytes; i++) {
    result += chars[(i * 7 + 13) % chars.length];
  }
  return result;
}

// ── Pre-built payloads ────────────────────────────────────────────────────

const questions = buildQuestions(NUM_QUESTIONS, TARGET_QUESTION_SIZE);
const responsePayload = buildResponse(NUM_QUESTIONS, TARGET_RESPONSE_SIZE);

const grillingJson = JSON.stringify({ name: 'Load Test Session', questions });
const responseJson = JSON.stringify({ answers: responsePayload });
const completeJson = JSON.stringify({ status: 'completed' });

// Log actual payload sizes for verification
console.log(`Grilling payload size: ${grillingJson.length} bytes (target: ${TARGET_QUESTION_SIZE})`);
console.log(`Response payload size: ${responseJson.length} bytes (target: ${TARGET_RESPONSE_SIZE})`);

// ── Helper: track bandwidth for a response ────────────────────────────────

function trackBandwidth(res, sentSize) {
  bandwidthUp.add(sentSize);
  var received = (res.body && res.body.length) || 0;
  bandwidthDown.add(received);
  totalDataSent.add(sentSize);
  totalDataReceived.add(received);
}

/// POST 一个请求并断言 status；失败时返回 null（VU 本轮迭代终止）。
function post(url, body, tag, expectStatus) {
  const res = http.post(url, body, { headers, tags: { name: tag } });
  trackBandwidth(res, body.length);
  check(res, { [tag]: (r) => r.status === expectStatus });
  return res.status === expectStatus ? res : null;
}

/// GET 一个请求并断言 status。
function get(url, tag, expectStatus) {
  const res = http.get(url, { headers, tags: { name: tag } });
  trackBandwidth(res, 0);
  check(res, { [tag]: (r) => r.status === expectStatus });
  return res.status === expectStatus ? res : null;
}

// ── Main test function ────────────────────────────────────────────────────

export default function () {
  // ── Round 1: agent 创建会话 ────────────────────────────────────────────
  const createRes = post(`${BASE_URL}/v1/sessions`, grillingJson, 'create_session', 201);
  if (!createRes) return;

  const sessionId = createRes.json('session_id');

  // 三轮「读题 → 等待 → 作答 → 取答」往返；第 1 轮随会话创建，
  // 第 2/3 轮由 agent 显式追加。
  for (let round = 1; round <= NUM_ROUNDS; round++) {
    if (round > 1) {
      // ── agent 追加下一轮 ──────────────────────────────────────────────
      sleep(Math.random() * 5 + 5); // 5-10s：agent 思考下一轮问题
      if (!post(`${BASE_URL}/v1/sessions/${sessionId}/rounds`, grillingJson, 'create_round', 201)) return;
    }

    // ── 用户浏览器打开链接读题 ──────────────────────────────────────────
    if (!get(`${BASE_URL}/v1/sessions/${sessionId}/rounds/current`, 'get_current', 200)) return;
    sleep(Math.random() * 3 + 2); // 2-5s：用户读题

    // ── agent 长轮询等待（此时未作答，2s 超时返回 202）─────────────────
    if (!get(`${BASE_URL}/v1/sessions/${sessionId}/rounds/${round}/response?wait=2`, 'agent_wait', 202)) return;

    // ── 用户提交答案 ────────────────────────────────────────────────────
    if (!post(`${BASE_URL}/v1/sessions/${sessionId}/rounds/${round}/response`, responseJson, 'submit_response', 201)) return;

    // ── agent 长轮询取到答案（立即返回 200）────────────────────────────
    if (!get(`${BASE_URL}/v1/sessions/${sessionId}/rounds/${round}/response?wait=3`, 'agent_wait', 200)) return;
  }

  // ── agent 完成会话（归档事务：搬全量 rounds → session_archive）─────────
  const completeRes = http.patch(`${BASE_URL}/v1/sessions/${sessionId}`, completeJson, {
    headers,
    tags: { name: 'complete_session' },
  });
  trackBandwidth(completeRes, completeJson.length);
  check(completeRes, { 'session completed': (r) => r.status === 200 });
}

// ── Summary report ────────────────────────────────────────────────────────

export function handleSummary(data) {
  var sentVals = data.metrics.total_data_sent && data.metrics.total_data_sent.values;
  var recvVals = data.metrics.total_data_received && data.metrics.total_data_received.values;
  var upVals = data.metrics.bandwidth_up_bytes && data.metrics.bandwidth_up_bytes.values;
  var downVals = data.metrics.bandwidth_down_bytes && data.metrics.bandwidth_down_bytes.values;
  var reqVals = data.metrics.http_reqs && data.metrics.http_reqs.values;
  var iterVals = data.metrics.iterations && data.metrics.iterations.values;

  var totalUpMB = (sentVals ? sentVals.count : 0) / (1024 * 1024);
  var totalDownMB = (recvVals ? recvVals.count : 0) / (1024 * 1024);
  var durationSec = (data.state && data.state.testRunDurationMs) ? data.state.testRunDurationMs / 1000 : 1;
  var avgUpMbps = ((totalUpMB * 8) / durationSec).toFixed(2);
  var avgDownMbps = ((totalDownMB * 8) / durationSec).toFixed(2);

  // 对照 3 Mbps 出口上限：超出说明网络先于算力成为瓶颈
  var netHeadroom = (3 - Math.max(avgUpMbps, avgDownMbps)).toFixed(2);

  // 每端点 p95 一览（k6 按 tags.name 生成子指标 http_req_duration{name:…}）
  var perEndpoint = [];
  Object.keys(data.metrics).forEach(function (key) {
    if (key.indexOf('http_req_duration{name:') === 0) {
      var p95 = data.metrics[key].values['p(95)'];
      perEndpoint.push('  ' + key.slice('http_req_duration{name:'.length, -1).padEnd(18) + ' p95=' + p95.toFixed(0) + 'ms');
    }
  });

  return {
    stdout: '\n' +
      '============================================================\n' +
      `              LOAD TEST REPORT (${PROFILE})` + '\n' +
      '============================================================\n' +
      '  Iterations (sessions): ' + (iterVals ? iterVals.count : 0) + '\n' +
      '  HTTP Requests:         ' + (reqVals ? reqVals.count : 0) + '  (' + (reqVals ? reqVals.rate : 0).toFixed(1) + ' req/s)\n' +
      '  Total data sent:       ' + totalUpMB.toFixed(2) + ' MB (avg ' + avgUpMbps + ' Mbps)\n' +
      '  Total data received:   ' + totalDownMB.toFixed(2) + ' MB (avg ' + avgDownMbps + ' Mbps)\n' +
      '  3Mbps headroom:        ' + netHeadroom + ' Mbps\n' +
      (perEndpoint.length ? '  Per-endpoint p95:\n' + perEndpoint.join('\n') + '\n' : '') +
      '  Test duration:         ' + durationSec.toFixed(0) + 's\n' +
      '============================================================\n',
  };
}
