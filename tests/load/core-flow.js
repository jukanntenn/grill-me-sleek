import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

// ── Custom bandwidth metrics ──────────────────────────────────────────────
const bandwidthUp = new Trend('bandwidth_up_bytes');
const bandwidthDown = new Trend('bandwidth_down_bytes');
const totalDataSent = new Counter('total_data_sent');
const totalDataReceived = new Counter('total_data_received');

// ── Configuration ─────────────────────────────────────────────────────────
const BASE_URL = 'https://localhost:8443';
const TARGET_QUESTION_SIZE = 32000;  // ~32KB for grilling payload
const TARGET_RESPONSE_SIZE = 8000;   // ~8KB for response payload
const NUM_QUESTIONS = 15;
const NUM_ROUNDS = 3;

export const options = {
  insecureSkipTLSVerify: true,
  stages: [
    { duration: '30s', target: 50 },    // ramp to 50 VUs
    { duration: '1m', target: 50 },     // hold at 50
    { duration: '30s', target: 100 },   // ramp to 100 VUs
    { duration: '1m', target: 100 },    // hold at 100
    { duration: '30s', target: 0 },     // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'],   // 95% of requests < 5s
    http_req_failed: ['rate<0.10'],      // error rate < 10%
    total_data_sent: ['count>0'],
    total_data_received: ['count>0'],
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

// ── Main test function ────────────────────────────────────────────────────

export default function () {
  // ── Round 1: Create session ─────────────────────────────────────────────
  const createRes = http.post(`${BASE_URL}/v1/sessions`, grillingJson, {
    headers,
    tags: { name: 'create_session' },
  });
  trackBandwidth(createRes, grillingJson.length);

  check(createRes, { 'session created': (r) => r.status === 201 });
  if (createRes.status !== 201) return;

  const sessionId = createRes.json('session_id');

  // Simulate user reading the questions
  sleep(Math.random() * 3 + 2); // 2-5s

  // ── Round 1: Submit response ────────────────────────────────────────────
  let submitRes = http.post(
    `${BASE_URL}/v1/sessions/${sessionId}/rounds/1/response`,
    responseJson,
    { headers, tags: { name: 'submit_response' } },
  );
  trackBandwidth(submitRes, responseJson.length);

  check(submitRes, { 'round 1 response submitted': (r) => r.status === 201 });
  if (submitRes.status !== 201) return;

  // Simulate waiting for the next round / thinking time
  sleep(Math.random() * 5 + 5); // 5-10s

  // ── Round 2: Create next round ──────────────────────────────────────────
  const createRound2 = http.post(
    `${BASE_URL}/v1/sessions/${sessionId}/rounds`,
    grillingJson,
    { headers, tags: { name: 'create_round' } },
  );
  trackBandwidth(createRound2, grillingJson.length);

  check(createRound2, { 'round 2 created': (r) => r.status === 201 });
  if (createRound2.status !== 201) return;

  sleep(Math.random() * 3 + 2); // 2-5s

  // ── Round 2: Submit response ────────────────────────────────────────────
  submitRes = http.post(
    `${BASE_URL}/v1/sessions/${sessionId}/rounds/2/response`,
    responseJson,
    { headers, tags: { name: 'submit_response' } },
  );
  trackBandwidth(submitRes, responseJson.length);

  check(submitRes, { 'round 2 response submitted': (r) => r.status === 201 });
  if (submitRes.status !== 201) return;

  sleep(Math.random() * 5 + 5); // 5-10s

  // ── Round 3: Create next round ──────────────────────────────────────────
  const createRound3 = http.post(
    `${BASE_URL}/v1/sessions/${sessionId}/rounds`,
    grillingJson,
    { headers, tags: { name: 'create_round' } },
  );
  trackBandwidth(createRound3, grillingJson.length);

  check(createRound3, { 'round 3 created': (r) => r.status === 201 });
  if (createRound3.status !== 201) return;

  sleep(Math.random() * 3 + 2); // 2-5s

  // ── Round 3: Submit response ────────────────────────────────────────────
  submitRes = http.post(
    `${BASE_URL}/v1/sessions/${sessionId}/rounds/3/response`,
    responseJson,
    { headers, tags: { name: 'submit_response' } },
  );
  trackBandwidth(submitRes, responseJson.length);

  check(submitRes, { 'round 3 response submitted': (r) => r.status === 201 });
}

// ── Summary report ────────────────────────────────────────────────────────

export function handleSummary(data) {
  var sentVals = data.metrics.total_data_sent && data.metrics.total_data_sent.values;
  var recvVals = data.metrics.total_data_received && data.metrics.total_data_received.values;
  var upVals = data.metrics.bandwidth_up_bytes && data.metrics.bandwidth_up_bytes.values;
  var downVals = data.metrics.bandwidth_down_bytes && data.metrics.bandwidth_down_bytes.values;

  var totalUpMB = (sentVals ? sentVals.count : 0) / (1024 * 1024);
  var totalDownMB = (recvVals ? recvVals.count : 0) / (1024 * 1024);
  var durationSec = (data.state && data.state.testRunDurationMs) ? data.state.testRunDurationMs / 1000 : 1;
  var avgUpMbps = ((totalUpMB * 8) / durationSec).toFixed(2);
  var avgDownMbps = ((totalDownMB * 8) / durationSec).toFixed(2);

  var p95Up = upVals && upVals['p(95)'] ? upVals['p(95)'] : 0;
  var p95Down = downVals && downVals['p(95)'] ? downVals['p(95)'] : 0;

  return {
    stdout: '\n' +
      '============================================================\n' +
      '              LOAD TEST BANDWIDTH REPORT                     \n' +
      '============================================================\n' +
      '  Total data sent:      ' + totalUpMB.toFixed(2) + ' MB\n' +
      '  Total data received:  ' + totalDownMB.toFixed(2) + ' MB\n' +
      '  Avg upload rate:      ' + avgUpMbps + ' Mbps\n' +
      '  Avg download rate:    ' + avgDownMbps + ' Mbps\n' +
      '  P95 request up:       ' + (p95Up / 1024).toFixed(1) + ' KB\n' +
      '  P95 request down:     ' + (p95Down / 1024).toFixed(1) + ' KB\n' +
      '  Test duration:        ' + durationSec.toFixed(0) + 's\n' +
      '============================================================\n',
  };
}
