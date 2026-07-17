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
const TARGET_QUESTION_SIZE = 32000;
const TARGET_RESPONSE_SIZE = 8000;
const NUM_QUESTIONS = 15;

export const options = {
  insecureSkipTLSVerify: true,
  stages: [
    { duration: '30s', target: 500 },   // ramp to 500 VUs
    { duration: '1m', target: 500 },    // hold at 500 VUs
    { duration: '30s', target: 0 },     // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.50'],      // allow up to 50% failure
    total_data_sent: ['count>0'],
    total_data_received: ['count>0'],
  },
};

const headers = { 'Content-Type': 'application/json' };

// ── Payload generators (same as core-flow.js) ─────────────────────────────

function generatePadding(targetBytes) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ';
  var result = '';
  for (var i = 0; i < targetBytes; i++) {
    result += chars[(i * 7 + 13) % chars.length];
  }
  return result;
}

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
  var actual = JSON.stringify({ name: 'X', questions: questions }).length;
  var gap = targetSize - actual;
  if (gap > 0) {
    var padPerQuestion = Math.floor(gap / numQuestions);
    var remainder = gap % numQuestions;
    for (var k = 0; k < numQuestions; k++) {
      questions[k].text += '\n\n' + generatePadding(padPerQuestion + (k < remainder ? 1 : 0));
    }
  }
  return questions;
}

function buildResponse(numQuestions, targetSize) {
  var answers = {};
  var options = ['Adopt a proven open-source solution', 'Build a custom in-house implementation', 'Use a managed cloud service', 'Hybrid approach combining multiple strategies'];
  for (var j = 0; j < numQuestions; j++) {
    answers['q' + (j + 1)] = {
      selected: options[j % options.length],
      reasoning: 'Selected based on team expertise.',
    };
  }
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

// ── Pre-built payloads ────────────────────────────────────────────────────
var questions = buildQuestions(NUM_QUESTIONS, TARGET_QUESTION_SIZE);
var responsePayload = buildResponse(NUM_QUESTIONS, TARGET_RESPONSE_SIZE);
var grillingJson = JSON.stringify({ name: 'Extreme Load Test', questions: questions });
var responseJson = JSON.stringify({ answers: responsePayload });

console.log('Grilling payload: ' + grillingJson.length + ' bytes');
console.log('Response payload: ' + responseJson.length + ' bytes');

// ── Helpers ───────────────────────────────────────────────────────────────

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
  var createRes = http.post(BASE_URL + '/v1/sessions', grillingJson, {
    headers: headers,
    tags: { name: 'create_session' },
  });
  trackBandwidth(createRes, grillingJson.length);

  check(createRes, { 'session created': function (r) { return r.status === 201; } });
  if (createRes.status !== 201) return;

  var sessionId = createRes.json('session_id');

  // Short sleep: simulate reading
  sleep(Math.random() * 1 + 0.5); // 0.5-1.5s

  // ── Round 1: Submit response ────────────────────────────────────────────
  var submitRes = http.post(
    BASE_URL + '/v1/sessions/' + sessionId + '/rounds/1/response',
    responseJson,
    { headers: headers, tags: { name: 'submit_response' } },
  );
  trackBandwidth(submitRes, responseJson.length);

  check(submitRes, { 'round 1 submitted': function (r) { return r.status === 201; } });
  if (submitRes.status !== 201) return;

  sleep(Math.random() * 2 + 1); // 1-3s

  // ── Round 2: Create next round ──────────────────────────────────────────
  var round2 = http.post(
    BASE_URL + '/v1/sessions/' + sessionId + '/rounds',
    grillingJson,
    { headers: headers, tags: { name: 'create_round' } },
  );
  trackBandwidth(round2, grillingJson.length);

  check(round2, { 'round 2 created': function (r) { return r.status === 201; } });
  if (round2.status !== 201) return;

  sleep(Math.random() * 1 + 0.5);

  // ── Round 2: Submit response ────────────────────────────────────────────
  submitRes = http.post(
    BASE_URL + '/v1/sessions/' + sessionId + '/rounds/2/response',
    responseJson,
    { headers: headers, tags: { name: 'submit_response' } },
  );
  trackBandwidth(submitRes, responseJson.length);

  check(submitRes, { 'round 2 submitted': function (r) { return r.status === 201; } });
  if (submitRes.status !== 201) return;

  sleep(Math.random() * 2 + 1);

  // ── Round 3: Create next round ──────────────────────────────────────────
  var round3 = http.post(
    BASE_URL + '/v1/sessions/' + sessionId + '/rounds',
    grillingJson,
    { headers: headers, tags: { name: 'create_round' } },
  );
  trackBandwidth(round3, grillingJson.length);

  check(round3, { 'round 3 created': function (r) { return r.status === 201; } });
  if (round3.status !== 201) return;

  sleep(Math.random() * 1 + 0.5);

  // ── Round 3: Submit response ────────────────────────────────────────────
  submitRes = http.post(
    BASE_URL + '/v1/sessions/' + sessionId + '/rounds/3/response',
    responseJson,
    { headers: headers, tags: { name: 'submit_response' } },
  );
  trackBandwidth(submitRes, responseJson.length);

  check(submitRes, { 'round 3 submitted': function (r) { return r.status === 201; } });
}

// ── Summary report ────────────────────────────────────────────────────────

export function handleSummary(data) {
  var sentVals = data.metrics.total_data_sent && data.metrics.total_data_sent.values;
  var recvVals = data.metrics.total_data_received && data.metrics.total_data_received.values;
  var upVals = data.metrics.bandwidth_up_bytes && data.metrics.bandwidth_up_bytes.values;
  var downVals = data.metrics.bandwidth_down_bytes && data.metrics.bandwidth_down_bytes.values;
  var durVals = data.metrics.http_req_duration && data.metrics.http_req_duration.values;

  var totalUpMB = (sentVals ? sentVals.count : 0) / (1024 * 1024);
  var totalDownMB = (recvVals ? recvVals.count : 0) / (1024 * 1024);
  var durationSec = (data.state && data.state.testRunDurationMs) ? data.state.testRunDurationMs / 1000 : 1;
  var avgUpMbps = ((totalUpMB * 8) / durationSec).toFixed(2);
  var avgDownMbps = ((totalDownMB * 8) / durationSec).toFixed(2);

  var p95Up = upVals && upVals['p(95)'] ? upVals['p(95)'] : 0;
  var p95Down = downVals && downVals['p(95)'] ? downVals['p(95)'] : 0;
  var p50Lat = durVals && durVals['p(50)'] ? durVals['p(50)'] : 0;
  var p95Lat = durVals && durVals['p(95)'] ? durVals['p(95)'] : 0;
  var p99Lat = durVals && durVals['p(99)'] ? durVals['p(99)'] : 0;
  var maxLat = durVals && durVals['max'] ? durVals['max'] : 0;
  var avgLat = durVals && durVals['avg'] ? durVals['avg'] : 0;

  var checks = data.metrics.checks && data.metrics.checks.values;
  var totalChecks = checks ? checks.passes + checks.fails : 0;
  var passRate = totalChecks > 0 ? (checks.passes / totalChecks * 100).toFixed(1) : '0';

  var failedRate = data.metrics.http_req_failed && data.metrics.http_req_failed.values
    ? (data.metrics.http_req_failed.values.rate * 100).toFixed(1) : '?';

  return {
    stdout: '\n' +
      '╔══════════════════════════════════════════════════════════════════╗\n' +
      '║              500 VU EXTREME LOAD TEST REPORT                   ║\n' +
      '╠══════════════════════════════════════════════════════════════════╣\n' +
      '║  Iterations:        ' + padRight(String(data.metrics.iterations.values.count), 6) + '                                  ║\n' +
      '║  HTTP Requests:     ' + padRight(String(data.metrics.http_reqs.values.count), 6) + '                                  ║\n' +
      '║  Request Rate:      ' + padRight((data.metrics.http_reqs.values.rate).toFixed(1) + ' req/s', 6) + '                            ║\n' +
      '║  Check Pass Rate:   ' + padRight(passRate + '%', 6) + '                                  ║\n' +
      '║  HTTP Fail Rate:    ' + padRight(failedRate + '%', 6) + '                                  ║\n' +
      '╠══════════════════════════════════════════════════════════════════╣\n' +
      '║  Latency (avg):     ' + padRight((avgLat).toFixed(0) + ' ms', 6) + '                                ║\n' +
      '║  Latency (p50):     ' + padRight((p50Lat).toFixed(0) + ' ms', 6) + '                                ║\n' +
      '║  Latency (p95):     ' + padRight((p95Lat).toFixed(0) + ' ms', 6) + '                                ║\n' +
      '║  Latency (p99):     ' + padRight((p99Lat).toFixed(0) + ' ms', 6) + '                                ║\n' +
      '║  Latency (max):     ' + padRight((maxLat).toFixed(0) + ' ms', 6) + '                                ║\n' +
      '╠══════════════════════════════════════════════════════════════════╣\n' +
      '║  Total data sent:   ' + padRight(totalUpMB.toFixed(2) + ' MB', 6) + '                               ║\n' +
      '║  Total data recv:   ' + padRight(totalDownMB.toFixed(2) + ' MB', 6) + '                               ║\n' +
      '║  Avg upload:        ' + padRight(avgUpMbps + ' Mbps', 6) + '                                 ║\n' +
      '║  Avg download:      ' + padRight(avgDownMbps + ' Mbps', 6) + '                                 ║\n' +
      '║  P95 request up:    ' + padRight((p95Up / 1024).toFixed(1) + ' KB', 6) + '                                ║\n' +
      '║  P95 request down:  ' + padRight((p95Down / 1024).toFixed(1) + ' KB', 6) + '                                ║\n' +
      '║  Test duration:     ' + padRight(durationSec.toFixed(0) + 's', 6) + '                                   ║\n' +
      '╚══════════════════════════════════════════════════════════════════╝\n',
  };
}

function padRight(str, len) {
  while (str.length < len) str += ' ';
  return str;
}
