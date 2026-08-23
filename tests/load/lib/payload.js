// 压测载荷生成共享库 —— 会话画像按 tests/load/README.md §业务画像参数表建模：
//   载荷大小 P50 8KB / P90 ~17KB / P99 ~32KB / 峰值 63KB（DefaultBodyLimit 64KB）
//   题目数 5-20，文本 padding 决定最终字节数
//
// 所有随机性走种子化 mulberry32 —— 同一 SEED 产生同一批会话，可复现、可对比。

/// mulberry32 PRNG —— 返回 [0,1)。
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/// 对数正态采样：给定 P50 与 P95（秒或字节），推导 μ/σ 后采样，cap 封顶。
export function sampleLognormal(rng, p50, p95, cap) {
  const sigma = Math.log(p95 / p50) / 1.645;
  const mu = Math.log(p50);
  // Box-Muller
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.min(Math.exp(mu + sigma * z), cap);
}

// ── 载荷大小分布 ───────────────────────────────────────────────────────────

export const SIZE_P50 = 8 * 1024;
export const SIZE_P95 = 20 * 1024;
export const SIZE_CAP = 63 * 1024;

export function samplePayloadSize(rng) {
  return Math.round(sampleLognormal(rng, SIZE_P50, SIZE_P95, SIZE_CAP));
}

/// 从目标字节数反推题目数：~1KB/题（含选项结构），夹在 5-20。
export function questionCountFor(targetBytes) {
  return Math.min(20, Math.max(5, Math.round(targetBytes / 1024)));
}

// ── 构造载荷 ───────────────────────────────────────────────────────────────

const TOPICS = [
  'Architecture Design', 'Data Modeling', 'Error Handling Strategy',
  'Performance Optimization', 'Security Considerations', 'API Design',
  'Testing Methodology', 'Deployment Pipeline', 'Monitoring & Observability',
  'Database Schema', 'Caching Strategy', 'Authentication Flow',
  'Rate Limiting', 'Concurrency Model', 'State Management',
  'Migration Path', 'Cost Model', 'Failure Modes',
  'Rollback Strategy', 'Observability Gaps',
];

const OPTION_LABELS = [
  'Adopt a proven open-source solution',
  'Build a custom in-house implementation',
  'Use a managed cloud service',
  'Hybrid approach combining multiple strategies',
];

function padding(targetBytes, salt) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ';
  let out = '';
  for (let i = 0; i < targetBytes; i++) {
    out += chars[(i * 7 + salt) % chars.length];
  }
  return out;
}

/// 构造一个 grilling 对象，序列化后字节数 ≈ targetBytes。
export function buildGrilling(rng, targetBytes, name) {
  const numQ = questionCountFor(targetBytes);
  const questions = [];
  for (let j = 0; j < numQ; j++) {
    const topic = TOPICS[j % TOPICS.length];
    questions.push({
      id: 'q' + (j + 1),
      header: 'Question ' + (j + 1) + ': ' + topic,
      text: 'Please describe your approach to ' + topic.toLowerCase(),
      type: 'single',
      options: OPTION_LABELS.map((l) => ({ label: l })),
    });
  }
  // 按差值补齐到目标大小
  const actual = JSON.stringify({ name: 'X', questions: questions }).length;
  const gap = targetBytes - actual;
  if (gap > 0) {
    const per = Math.floor(gap / numQ);
    const rem = gap % numQ;
    for (let k = 0; k < numQ; k++) {
      questions[k].text += '\n\n' + padding(per + (k < rem ? 1 : 0), k);
    }
  }
  return { name: name || 'Load Test Session', questions };
}

/// 构造与 grilling 对应的答案集（选第一项 + 简短理由，≈ 0.5-1KB，符合真实答案远小于题目的形态）。
export function buildAnswers(grilling) {
  const answers = {};
  for (const q of grilling.questions) {
    answers[q.id] = {
      selected: q.options[0].label,
      reasoning: 'Selected based on team expertise and maintenance cost.',
    };
  }
  return { answers };
}

/// revise 版答案：换一个选项并注明修订原因（比首次答案略小）。
export function buildRevisedAnswers(grilling) {
  const answers = {};
  for (const q of grilling.questions) {
    const opt = q.options[q.id.length % q.options.length];
    answers[q.id] = {
      selected: opt.label,
      reasoning: 'Revised after reconsidering integration risk.',
    };
  }
  return { answers };
}
