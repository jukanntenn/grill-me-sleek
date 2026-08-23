// Node 侧 HTTP/SSE 工具（hold-suite / sse-holder 共用）。
// 自签名 TLS 环境下直接用 node:https（fetch 不接受自定义 CA/reject 开关的
// 简单用法），长连接（SSE/长轮询）也更好控制。

import https from 'node:https';
import zlib from 'node:zlib';

const agent = new https.Agent({ keepAlive: false, maxSockets: Infinity });

/// 单次请求：method url {headers, body} → {status, headers, bytes, ms, body}
export function request(method, url, { headers = {}, body = null, timeoutMs = 70000 } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method,
        agent,
        rejectUnauthorized: false,
        headers: {
          ...headers,
          host: u.host,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          let body = raw;
          if ((res.headers['content-encoding'] || '').includes('gzip')) {
            try {
              body = zlib.gunzipSync(raw);
            } catch {}
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            bytes: raw.length, // 线上（压缩后）字节
            body,
            ms: Date.now() - t0,
          });
        });
      },
    );
    req.on('error', (e) => resolve({ status: 0, error: String(e), bytes: 0, ms: Date.now() - t0 }));
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    if (body !== null) req.write(body);
    req.end();
  });
}

/// 建立 SSE 连接。返回 {close(), promise}；promise 在连接彻底结束时 resolve。
/// onData(bytesChunk) 可选，用于字节数统计。
export function sseConnect(url, onData) {
  const u = new URL(url);
  let req;
  let closed = false;
  const promise = new Promise((resolve) => {
    req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'GET',
        agent,
        rejectUnauthorized: false,
        headers: { accept: 'text/event-stream', host: u.host },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve({ status: res.statusCode });
          return;
        }
        res.on('data', (c) => onData && onData(c.length));
        res.on('end', () => resolve({ status: 200, ended: true }));
        res.on('error', () => resolve({ status: 200, ended: true }));
      },
    );
    req.on('error', (e) => resolve({ status: 0, error: String(e) }));
    // 服务器 keepalive 85s —— 客户端 100s 死亡定时（连接僵死检测）
    req.setTimeout(100000, () => req.destroy(new Error('sse-timeout')));
  });
  return {
    promise,
    close() {
      if (!closed) {
        closed = true;
        try {
          req.destroy();
        } catch {}
      }
    },
  };
}

export const JSON_HDRS = { 'content-type': 'application/json', 'accept': 'application/json', 'accept-encoding': 'gzip' };
